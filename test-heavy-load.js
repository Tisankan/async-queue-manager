const { TaskGraph, QueueManager, AdaptiveConcurrency, Monitor } = require('./index');
const os = require('os');

const CONFIG = {
  totalTasks: 1000,           
  maxDependencies: 5,       
  maxExecutionTime: 500,     
  minExecutionTime: 10,       
  cpuIntensiveTasks: 200,     
  memoryIntensiveTasks: 200,  
  errorProbability: 0.02,     
  monitorPort: 3030,          
  metricsInterval: 500,       
};

const metrics = {
  startTime: null,
  endTime: null,
  tasksCompleted: 0,
  tasksFailed: 0,
  peakMemoryUsage: 0,
  peakCpuUsage: 0,
  concurrencyChanges: [],
  throughputHistory: []
};

console.log(`Creating task graph with ${CONFIG.totalTasks} tasks...`);
const taskGraph = new TaskGraph();

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function cpuIntensiveOperation(duration) {
  const start = Date.now();
  while (Date.now() - start < duration) {
    for (let i = 0; i < 10000; i++) {
      Math.sqrt(Math.random() * 10000) * Math.sin(Math.random() * 360);
    }
  }
}

function memoryIntensiveOperation(size) {
  const arrays = [];
  for (let i = 0; i < size; i++) {
    arrays.push(new Array(10000).fill(Math.random()));
  }
  return arrays.length; 
}

for (let i = 1; i <= CONFIG.totalTasks; i++) {
  const taskId = `task-${i}`;
  const isMemoryIntensive = i <= CONFIG.memoryIntensiveTasks;
  const isCpuIntensive = i > CONFIG.memoryIntensiveTasks && i <= (CONFIG.memoryIntensiveTasks + CONFIG.cpuIntensiveTasks);
  const executionTime = getRandomInt(CONFIG.minExecutionTime, CONFIG.maxExecutionTime);
  
  taskGraph.addTask(taskId, async () => {
    const startTime = Date.now();
    
    try {
      if (Math.random() < CONFIG.errorProbability) {
        throw new Error(`Random failure in ${taskId}`);
      }
      
      if (isCpuIntensive) {
        cpuIntensiveOperation(executionTime);
      } else if (isMemoryIntensive) {
        const arraySize = getRandomInt(5, 20);
        memoryIntensiveOperation(arraySize);
        await new Promise(resolve => setTimeout(resolve, executionTime));
      } else {
        await new Promise(resolve => setTimeout(resolve, executionTime));
      }
      
      return {
        taskId,
        executionTime: Date.now() - startTime,
        type: isCpuIntensive ? 'cpu-intensive' : (isMemoryIntensive ? 'memory-intensive' : 'regular')
      };
    } catch (error) {
      throw error;
    }
  });
}

console.log('Creating complex dependency relationships...');
for (let i = CONFIG.totalTasks; i > 1; i--) {
  const taskId = `task-${i}`;
  
  const numDependencies = getRandomInt(0, Math.min(CONFIG.maxDependencies, i - 1));
  
  if (numDependencies > 0) {
    const dependencies = [];
    for (let j = 0; j < numDependencies; j++) {
      const dependencyId = getRandomInt(1, i - 1);
      dependencies.push(`task-${dependencyId}`);
    }
    
    const uniqueDependencies = [...new Set(dependencies)];
    if (uniqueDependencies.length > 0) {
      taskGraph.addDependency(taskId, uniqueDependencies);
    }
  }
}

console.log('Setting up adaptive concurrency...');
const adaptiveConcurrency = new AdaptiveConcurrency({
  minConcurrency: 1,
  maxConcurrency: os.cpus().length * 2, 
  targetCpuUtilization: 70,
  targetMemoryUtilization: 70,
  checkInterval: 1000,
  adjustmentStep: 1
});

console.log('Setting up queue manager...');
const queueManager = new QueueManager(taskGraph, {
  concurrency: os.cpus().length, 
  adaptiveConcurrency
});

console.log(`Setting up monitoring on port ${CONFIG.monitorPort}...`);
const monitor = new Monitor(queueManager, {
  port: CONFIG.monitorPort,
  metricsInterval: CONFIG.metricsInterval
});

queueManager.on('task-start', ({ taskId }) => {
  process.stdout.write(`\rRunning: ${queueManager.running.size}, Completed: ${metrics.tasksCompleted}, Failed: ${metrics.tasksFailed}`);
});

queueManager.on('task-complete', ({ taskId, result }) => {
  metrics.tasksCompleted++;
  
  if (metrics.tasksCompleted % 50 === 0) {
    const elapsedSeconds = (Date.now() - metrics.startTime) / 1000;
    const throughput = metrics.tasksCompleted / elapsedSeconds;
    metrics.throughputHistory.push({
      tasksCompleted: metrics.tasksCompleted,
      throughput: throughput.toFixed(2)
    });
  }
});

queueManager.on('task-error', ({ taskId, error }) => {
  metrics.tasksFailed++;
  console.error(`\nTask ${taskId} failed: ${error.message}`);
});

queueManager.on('queue-complete', (stats) => {
  metrics.endTime = Date.now();
  const duration = (metrics.endTime - metrics.startTime) / 1000;
  
  console.log('\n\n========== TEST RESULTS ==========');
  console.log(`Total tasks: ${CONFIG.totalTasks}`);
  console.log(`Completed tasks: ${metrics.tasksCompleted}`);
  console.log(`Failed tasks: ${metrics.tasksFailed}`);
  console.log(`Total duration: ${duration.toFixed(2)} seconds`);
  console.log(`Average throughput: ${(metrics.tasksCompleted / duration).toFixed(2)} tasks/second`);
  console.log(`Peak memory usage: ${(metrics.peakMemoryUsage / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Peak CPU usage: ${metrics.peakCpuUsage.toFixed(2)}%`);
  console.log(`Concurrency changes: ${metrics.concurrencyChanges.length}`);
  console.log('\nThroughput history:');
  metrics.throughputHistory.forEach(entry => {
    console.log(`  At ${entry.tasksCompleted} tasks: ${entry.throughput} tasks/second`);
  });
  console.log('\nConcurrency changes:');
  metrics.concurrencyChanges.forEach(change => {
    console.log(`  At ${change.timestamp}: ${change.previous} → ${change.new} (CPU: ${change.cpuUsage.toFixed(2)}%, Memory: ${change.memoryUsage.toFixed(2)}%)`);
  });
  
  console.log('\nStopping services...');
  Promise.all([
    monitor.stop(),
    adaptiveConcurrency.stop()
  ]).then(() => {
    console.log('Test completed successfully!');
    console.log(`Dashboard was available at http://localhost:${CONFIG.monitorPort}`);
  });
});

adaptiveConcurrency.on('concurrency-update', (newConcurrency) => {
  metrics.concurrencyChanges.push({
    timestamp: new Date().toISOString(),
    previous: queueManager.concurrency,
    new: newConcurrency,
    cpuUsage: metrics.currentCpuUsage || 0,
    memoryUsage: metrics.currentMemoryUsage || 0
  });
});

adaptiveConcurrency.on('metrics', (data) => {
  metrics.currentCpuUsage = data.cpuUsage;
  metrics.currentMemoryUsage = data.memoryUsage;
  
  metrics.peakCpuUsage = Math.max(metrics.peakCpuUsage, data.cpuUsage);
  metrics.peakMemoryUsage = Math.max(metrics.peakMemoryUsage, process.memoryUsage().heapUsed);
});

monitor.on('started', ({ port }) => {
  console.log(`Monitor server started on port ${port}`);
  console.log(`Dashboard available at http://localhost:${port}`);
});

console.log('Starting the heavy load test...');
Promise.all([
  monitor.start(),
  adaptiveConcurrency.start()
]).then(() => {
  console.log('Services started successfully');
  console.log(`Dashboard available at http://localhost:${CONFIG.monitorPort}`);
  
  metrics.startTime = Date.now();
  queueManager.start();
  console.log('Queue manager started');
  console.log('Processing tasks...');
}).catch(error => {
  console.error('Failed to start services:', error);
});