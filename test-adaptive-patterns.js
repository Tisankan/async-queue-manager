/**
 * Adaptive Concurrency Pattern Test for Async Queue Manager
 * 
 * This test script creates tasks with different workload patterns over time
 * to evaluate how effectively the adaptive concurrency mechanism responds to
 * changing resource demands. It simulates real-world scenarios where workload
 * characteristics change during execution.
 */

const { TaskGraph, QueueManager, AdaptiveConcurrency, Monitor } = require('./index');
const os = require('os');

// Configuration
const CONFIG = {
  totalTasks: 2000,           // Total number of tasks to create
  batchSize: 200,             // Number of tasks per batch
  maxExecutionTime: 300,      // Maximum execution time in ms
  minExecutionTime: 20,       // Minimum execution time in ms
  monitorPort: 3031,          // Port for the monitoring dashboard
  metricsInterval: 500,       // Metrics collection interval in ms
  adaptiveCheckInterval: 800, // Adaptive concurrency check interval
};

// Workload patterns (each represents a different resource usage profile)
const PATTERNS = [
  { name: 'CPU Spike', cpuIntensive: 0.8, memoryIntensive: 0.1, io: 0.1 },
  { name: 'Memory Spike', cpuIntensive: 0.1, memoryIntensive: 0.8, io: 0.1 },
  { name: 'IO Bound', cpuIntensive: 0.1, memoryIntensive: 0.1, io: 0.8 },
  { name: 'Balanced', cpuIntensive: 0.33, memoryIntensive: 0.33, io: 0.34 },
  { name: 'CPU & Memory', cpuIntensive: 0.45, memoryIntensive: 0.45, io: 0.1 },
];

// Performance metrics
const metrics = {
  startTime: null,
  endTime: null,
  tasksCompleted: 0,
  tasksFailed: 0,
  peakMemoryUsage: 0,
  peakCpuUsage: 0,
  concurrencyChanges: [],
  patternChanges: [],
  throughputByPattern: {},
  adaptationSpeed: []
};

// Initialize throughput tracking for each pattern
PATTERNS.forEach(pattern => {
  metrics.throughputByPattern[pattern.name] = [];
});

// Create task graph
console.log(`Creating task graph for adaptive pattern testing...`);
const taskGraph = new TaskGraph();

// Helper functions
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

function ioIntensiveOperation(duration) {
  return new Promise(resolve => setTimeout(resolve, duration));
}

// Create tasks in batches with different patterns
let currentTaskId = 0;
let currentBatch = 0;

for (const pattern of PATTERNS) {
  console.log(`Creating batch of tasks with pattern: ${pattern.name}`);
  
  // Create a batch of tasks with this pattern
  for (let i = 0; i < CONFIG.batchSize; i++) {
    currentTaskId++;
    const taskId = `task-${currentTaskId}`;
    const executionTime = getRandomInt(CONFIG.minExecutionTime, CONFIG.maxExecutionTime);
    
    // Determine task type based on pattern probabilities
    const randomValue = Math.random();
    const isCpuIntensive = randomValue < pattern.cpuIntensive;
    const isMemoryIntensive = !isCpuIntensive && randomValue < (pattern.cpuIntensive + pattern.memoryIntensive);
    const isIoBound = !isCpuIntensive && !isMemoryIntensive;
    
    // Add metadata to track which pattern this task belongs to
    const taskMetadata = {
      pattern: pattern.name,
      batchId: currentBatch,
      executionTime,
      type: isCpuIntensive ? 'cpu' : (isMemoryIntensive ? 'memory' : 'io')
    };
    
    // Create the task with the appropriate workload
    taskGraph.addTask(taskId, async () => {
      const startTime = Date.now();
      
      try {
        if (isCpuIntensive) {
          // CPU intensive workload
          cpuIntensiveOperation(executionTime);
        } else if (isMemoryIntensive) {
          // Memory intensive workload
          const arraySize = getRandomInt(10, 30);
          memoryIntensiveOperation(arraySize);
          await ioIntensiveOperation(executionTime / 4); // Some waiting to keep memory allocated
        } else {
          // IO bound workload
          await ioIntensiveOperation(executionTime);
        }
        
        return {
          taskId,
          metadata: taskMetadata,
          actualExecutionTime: Date.now() - startTime
        };
      } catch (error) {
        throw error;
      }
    });
    
    // Create some dependencies within the same batch
    if (i > 0 && Math.random() < 0.3) {
      const dependencyId = `task-${currentTaskId - getRandomInt(1, Math.min(5, i))}`;  
      taskGraph.addDependency(taskId, dependencyId);
    }
  }
  
  currentBatch++;
}

// Create cross-pattern dependencies (some tasks depend on tasks from previous patterns)
for (let i = CONFIG.batchSize + 1; i <= currentTaskId; i++) {
  if (Math.random() < 0.15) { // 15% chance of cross-pattern dependency
    const taskId = `task-${i}`;
    const dependencyBatch = Math.floor(Math.random() * (currentBatch - 1)); // Pick a previous batch
    const dependencyTaskId = `task-${(dependencyBatch * CONFIG.batchSize) + getRandomInt(1, CONFIG.batchSize)}`;  
    
    // Only add if it doesn't create a circular dependency
    if (i > parseInt(dependencyTaskId.split('-')[1])) {
      taskGraph.addDependency(taskId, dependencyTaskId);
    }
  }
}

// Setup adaptive concurrency with more sensitive settings
console.log('Setting up adaptive concurrency with sensitive settings...');
const adaptiveConcurrency = new AdaptiveConcurrency({
  minConcurrency: 1,
  maxConcurrency: os.cpus().length * 3, // Allow up to 3x CPU cores
  targetCpuUtilization: 65,  // Slightly lower target to be more responsive
  targetMemoryUtilization: 65,
  checkInterval: CONFIG.adaptiveCheckInterval,
  adjustmentStep: 2  // More aggressive adjustment
});

// Setup queue manager
console.log('Setting up queue manager...');
const queueManager = new QueueManager(taskGraph, {
  concurrency: os.cpus().length,
  adaptiveConcurrency
});

// Setup monitoring
console.log(`Setting up monitoring on port ${CONFIG.monitorPort}...`);
const monitor = new Monitor(queueManager, {
  port: CONFIG.monitorPort,
  metricsInterval: CONFIG.metricsInterval
});

// Track current pattern being processed
let currentPattern = null;
let patternStartTime = null;
let patternTasksCompleted = 0;

// Event handlers
queueManager.on('task-start', ({ taskId, task }) => {
  process.stdout.write(`\rRunning: ${queueManager.running.size}, Completed: ${metrics.tasksCompleted}, Failed: ${metrics.tasksFailed}`);
});

queueManager.on('task-complete', ({ taskId, result }) => {
  metrics.tasksCompleted++;
  
  // Track which pattern this task belongs to
  const taskPattern = result.metadata.pattern;
  
  // Detect pattern changes
  if (currentPattern !== taskPattern) {
    if (currentPattern) {
      // Record metrics for the previous pattern
      const patternDuration = (Date.now() - patternStartTime) / 1000;
      const patternThroughput = patternTasksCompleted / patternDuration;
      
      metrics.throughputByPattern[currentPattern].push({
        tasks: patternTasksCompleted,
        throughput: patternThroughput.toFixed(2),
        concurrency: queueManager.concurrency
      });
      
      console.log(`\nPattern change: ${currentPattern} → ${taskPattern}`);
      console.log(`Pattern ${currentPattern} completed ${patternTasksCompleted} tasks at ${patternThroughput.toFixed(2)} tasks/sec`);
    }
    
    // Start tracking the new pattern
    currentPattern = taskPattern;
    patternStartTime = Date.now();
    patternTasksCompleted = 1; // Count this task
    
    metrics.patternChanges.push({
      timestamp: new Date().toISOString(),
      pattern: currentPattern,
      concurrency: queueManager.concurrency
    });
  } else {
    patternTasksCompleted++;
  }
  
  // Calculate overall throughput periodically
  if (metrics.tasksCompleted % 50 === 0) {
    const elapsedSeconds = (Date.now() - metrics.startTime) / 1000;
    const throughput = metrics.tasksCompleted / elapsedSeconds;
    console.log(`\nCompleted ${metrics.tasksCompleted} tasks at ${throughput.toFixed(2)} tasks/sec, current concurrency: ${queueManager.concurrency}`);
  }
});

queueManager.on('task-error', ({ taskId, error }) => {
  metrics.tasksFailed++;
  console.error(`\nTask ${taskId} failed: ${error.message}`);
});

queueManager.on('queue-complete', (stats) => {
  metrics.endTime = Date.now();
  const duration = (metrics.endTime - metrics.startTime) / 1000;
  
  console.log('\n\n========== ADAPTIVE PATTERN TEST RESULTS ==========');
  console.log(`Total tasks: ${CONFIG.totalTasks}`);
  console.log(`Completed tasks: ${metrics.tasksCompleted}`);
  console.log(`Failed tasks: ${metrics.tasksFailed}`);
  console.log(`Total duration: ${duration.toFixed(2)} seconds`);
  console.log(`Average throughput: ${(metrics.tasksCompleted / duration).toFixed(2)} tasks/second`);
  console.log(`Peak memory usage: ${(metrics.peakMemoryUsage / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Peak CPU usage: ${metrics.peakCpuUsage.toFixed(2)}%`);
  console.log(`Concurrency changes: ${metrics.concurrencyChanges.length}`);
  
  console.log('\nPattern Changes:');
  metrics.patternChanges.forEach(change => {
    console.log(`  At ${change.timestamp}: Switched to ${change.pattern} pattern with concurrency ${change.concurrency}`);
  });
  
  console.log('\nThroughput by Pattern:');
  Object.entries(metrics.throughputByPattern).forEach(([pattern, measurements]) => {
    if (measurements.length > 0) {
      const avgThroughput = measurements.reduce((sum, m) => sum + parseFloat(m.throughput), 0) / measurements.length;
      console.log(`  ${pattern}: ${avgThroughput.toFixed(2)} tasks/sec (avg concurrency: ${measurements.reduce((sum, m) => sum + m.concurrency, 0) / measurements.length})`);
    }
  });
  
  console.log('\nAdaptation Speed:');
  metrics.adaptationSpeed.forEach(adaptation => {
    console.log(`  Pattern ${adaptation.pattern}: ${adaptation.timeToAdapt.toFixed(2)} seconds to reach optimal concurrency`);
  });
  
  console.log('\nConcurrency changes:');
  metrics.concurrencyChanges.forEach(change => {
    console.log(`  At ${change.timestamp}: ${change.previous} → ${change.new} (CPU: ${change.cpuUsage.toFixed(2)}%, Memory: ${change.memoryUsage.toFixed(2)}%)`);
  });
  
  // Stop monitoring and adaptive concurrency
  console.log('\nStopping services...');
  Promise.all([
    monitor.stop(),
    adaptiveConcurrency.stop()
  ]).then(() => {
    console.log('Test completed successfully!');
    console.log(`Dashboard was available at http://localhost:${CONFIG.monitorPort}`);
  });
});

// Track concurrency changes and adaptation speed
let patternOptimalConcurrency = {};
let patternStartConcurrency = {};
let patternAdaptationStartTime = {};

adaptiveConcurrency.on('concurrency-update', (newConcurrency) => {
  const timestamp = new Date().toISOString();
  
  metrics.concurrencyChanges.push({
    timestamp,
    previous: queueManager.concurrency,
    new: newConcurrency,
    cpuUsage: metrics.currentCpuUsage || 0,
    memoryUsage: metrics.currentMemoryUsage || 0,
    currentPattern: currentPattern
  });
  
  // Track adaptation speed for each pattern
  if (currentPattern) {
    // Initialize tracking for a new pattern
    if (patternStartConcurrency[currentPattern] === undefined) {
      patternStartConcurrency[currentPattern] = queueManager.concurrency;
      patternAdaptationStartTime[currentPattern] = Date.now();
      console.log(`\nStarting adaptation tracking for pattern ${currentPattern} at concurrency ${patternStartConcurrency[currentPattern]}`);
    }
    
    // Check if we've reached a stable concurrency (3 consecutive changes in same direction)
    if (metrics.concurrencyChanges.length >= 3) {
      const recentChanges = metrics.concurrencyChanges.slice(-3);
      const allIncreasing = recentChanges.every((c, i, arr) => i === 0 || (c.new > arr[i-1].new));
      const allDecreasing = recentChanges.every((c, i, arr) => i === 0 || (c.new < arr[i-1].new));
      
      // If we've found a stable pattern (consistently increasing or decreasing)
      if (allIncreasing || allDecreasing) {
        // Record the adaptation time if we haven't already for this pattern
        if (!patternOptimalConcurrency[currentPattern]) {
          const adaptationTime = (Date.now() - patternAdaptationStartTime[currentPattern]) / 1000;
          patternOptimalConcurrency[currentPattern] = newConcurrency;
          
          metrics.adaptationSpeed.push({
            pattern: currentPattern,
            timeToAdapt: adaptationTime,
            startConcurrency: patternStartConcurrency[currentPattern],
            optimalConcurrency: newConcurrency
          });
          
          console.log(`\nPattern ${currentPattern} reached optimal concurrency of ${newConcurrency} in ${adaptationTime.toFixed(2)} seconds`);
        }
      }
    }
  }
});

adaptiveConcurrency.on('metrics', (data) => {
  metrics.currentCpuUsage = data.cpuUsage;
  metrics.currentMemoryUsage = data.memoryUsage;
  
  // Track peak usage
  metrics.peakCpuUsage = Math.max(metrics.peakCpuUsage, data.cpuUsage);
  metrics.peakMemoryUsage = Math.max(metrics.peakMemoryUsage, process.memoryUsage().heapUsed);
});

monitor.on('started', ({ port }) => {
  console.log(`Monitor server started on port ${port}`);
  console.log(`Dashboard available at http://localhost:${port}`);
});

// Start the test
console.log('Starting the adaptive pattern test...');
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