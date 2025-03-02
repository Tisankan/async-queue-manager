const { TaskGraph, QueueManager, AdaptiveConcurrency, Monitor } = require('../index');


const taskGraph = new TaskGraph();


taskGraph.addTask('task1', async () => {
  console.log('Executing task 1');
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Task 1 completed');
  return { result: 'Task 1 result' };
});

taskGraph.addTask('task2', async () => {
  console.log('Executing task 2');
  await new Promise(resolve => setTimeout(resolve, 1500));
  console.log('Task 2 completed');
  return { result: 'Task 2 result' };
});

taskGraph.addTask('task3', async () => {
  console.log('Executing task 3');
  await new Promise(resolve => setTimeout(resolve, 800));
  console.log('Task 3 completed');
  return { result: 'Task 3 result' };
});

taskGraph.addTask('task4', async () => {
  console.log('Executing task 4');
  await new Promise(resolve => setTimeout(resolve, 1200));
  console.log('Task 4 completed');
  return { result: 'Task 4 result' };
});

taskGraph.addTask('task5', async () => {
  console.log('Executing task 5');
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Task 5 completed');
  return { result: 'Task 5 result' };
});


taskGraph.addDependency('task3', 'task1');
taskGraph.addDependency('task4', ['task2', 'task3']);
taskGraph.addDependency('task5', 'task4');


const adaptiveConcurrency = new AdaptiveConcurrency({
  minConcurrency: 1,
  maxConcurrency: 3,
  targetCpuUtilization: 70,
  checkInterval: 2000
});


const queueManager = new QueueManager(taskGraph, {
  concurrency: 2,
  adaptiveConcurrency
});


const monitor = new Monitor(queueManager, {
  port: 3000,
  metricsInterval: 1000
});


queueManager.on('task-start', ({ taskId }) => {
  console.log(`Task ${taskId} started`);
});

queueManager.on('task-complete', ({ taskId, result }) => {
  console.log(`Task ${taskId} completed with result:`, result);
});

queueManager.on('task-error', ({ taskId, error }) => {
  console.error(`Task ${taskId} failed:`, error);
});

queueManager.on('queue-complete', (stats) => {
  console.log('All tasks completed!');
  console.log('Stats:', stats);
  

  monitor.stop().then(() => {
    adaptiveConcurrency.stop();
    console.log('Monitor and adaptive concurrency stopped');
  });
});


adaptiveConcurrency.on('concurrency-update', (newConcurrency) => {
  console.log(`Concurrency updated to ${newConcurrency}`);
});

monitor.on('started', ({ port }) => {
  console.log(`Monitor server started on port ${port}`);
  console.log(`Dashboard available at http://localhost:${port}`);
});

Promise.all([
  monitor.start(),
  adaptiveConcurrency.start()
]).then(() => {
  console.log('Monitor and adaptive concurrency started');
  
  queueManager.start();
  console.log('Queue manager started');
});