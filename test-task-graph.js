const TaskGraph = require('./lib/task-graph');
const QueueManager = require('./lib/queue-manager');

// Create a new task graph
const graph = new TaskGraph();

// Add some tasks
graph.addTask('task1', async () => {
  console.log('Executing task 1');
  await new Promise(resolve => setTimeout(resolve, 500));
  return 'Task 1 completed';
});

graph.addTask('task2', async () => {
  console.log('Executing task 2');
  await new Promise(resolve => setTimeout(resolve, 700));
  return 'Task 2 completed';
});

graph.addTask('task3', async () => {
  console.log('Executing task 3');
  await new Promise(resolve => setTimeout(resolve, 300));
  return 'Task 3 completed';
});

graph.addTask('task4', async () => {
  console.log('Executing task 4');
  await new Promise(resolve => setTimeout(resolve, 600));
  return 'Task 4 completed';
});

// Add dependencies
graph.addDependency('task3', 'task1'); // task3 depends on task1
graph.addDependency('task4', ['task2', 'task3']); // task4 depends on task2 and task3

// Test topological order
console.log('Topological order:', graph.getTopologicalOrder());

// Test cycle detection
try {
  // This would create a cycle: task1 -> task3 -> task1
  graph.addDependency('task1', 'task3');
} catch (error) {
  console.log('Cycle detection working:', error.message);
}

console.log('Dependencies for task3:', graph.getDependencies('task3'));
console.log('Dependencies for task4:', graph.getDependencies('task4'));
console.log('Ready tasks before execution:', graph.getReadyTasks());

// Create a queue manager to execute the tasks
const queueManager = new QueueManager(graph, {
  concurrency: 2,
  autoStart: false
});

// Set up event listeners
queueManager.on('task-start', ({ taskId }) => {
  console.log(`Started: ${taskId}`);
});

queueManager.on('task-complete', ({ taskId, result }) => {
  console.log(`Completed: ${taskId} with result: ${result}`);
});

queueManager.on('task-error', ({ taskId, error }) => {
  console.error(`Error in ${taskId}:`, error);
});

queueManager.on('queue-complete', (stats) => {
  console.log('All tasks completed!');
  console.log(`Execution time: ${stats.endTime - stats.startTime}ms`);
  console.log(`Completed: ${stats.completed}, Failed: ${stats.failed}`);
});

// Start the queue
console.log('Starting queue execution...');
queueManager.start();