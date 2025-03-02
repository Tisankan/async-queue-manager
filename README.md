# Async Queue Manager

A powerful Node.js package for managing asynchronous task queues with DAG-based dependencies, adaptive concurrency, and real-time monitoring.

## Features

- **Directed Acyclic Graph (DAG) Task Management**: Define complex task dependencies and ensure proper execution order
- **Adaptive Concurrency**: Automatically adjust concurrency based on system resources
- **Real-time Monitoring**: Web-based dashboard for monitoring task execution
- **Distributed Processing**: Support for distributed task execution via RabbitMQ and gRPC
- **Event-driven Architecture**: Comprehensive event system for tracking task lifecycle
- **Fault Tolerance**: Robust error handling and task retry capabilities

## Installation

```bash
npm install async-queue-manager
```

For distributed processing features, install the optional dependencies:

```bash
npm install async-queue-manager @grpc/grpc-js @grpc/proto-loader amqplib
```

## Basic Usage

```javascript
const { TaskGraph, QueueManager } = require('async-queue-manager');

// Create a task graph
const taskGraph = new TaskGraph();

// Add tasks
taskGraph.addTask('task1', async () => {
  console.log('Executing task 1');
  await new Promise(resolve => setTimeout(resolve, 1000));
  return 'Task 1 result';
});

taskGraph.addTask('task2', async () => {
  console.log('Executing task 2');
  await new Promise(resolve => setTimeout(resolve, 1500));
  return 'Task 2 result';
});

// Define dependencies (task3 depends on task1)
taskGraph.addDependency('task3', 'task1');

// Create a queue manager
const queueManager = new QueueManager(taskGraph, {
  concurrency: 2
});

// Set up event listeners
queueManager.on('task-complete', ({ taskId, result }) => {
  console.log(`Task ${taskId} completed with result:`, result);
});

queueManager.on('queue-complete', (stats) => {
  console.log('All tasks completed!');
  console.log('Stats:', stats);
});

// Start processing tasks
queueManager.start();
```

## Advanced Features

### Adaptive Concurrency

```javascript
const { AdaptiveConcurrency } = require('async-queue-manager');

const adaptiveConcurrency = new AdaptiveConcurrency({
  minConcurrency: 1,
  maxConcurrency: 8,
  targetCpuUtilization: 70,
  targetMemoryUtilization: 70,
  checkInterval: 1000,
  adjustmentStep: 1
});

const queueManager = new QueueManager(taskGraph, {
  adaptiveConcurrency
});

adaptiveConcurrency.on('concurrency-update', (newConcurrency) => {
  console.log(`Concurrency updated to ${newConcurrency}`);
});

// Start adaptive concurrency monitoring
adaptiveConcurrency.start();
```

### Real-time Monitoring

```javascript
const { Monitor } = require('async-queue-manager');

const monitor = new Monitor(queueManager, {
  port: 3030,
  metricsInterval: 1000
});

monitor.on('started', ({ port }) => {
  console.log(`Monitor server started on port ${port}`);
  console.log(`Dashboard available at http://localhost:${port}`);
});

// Start the monitoring server
monitor.start();
```

### Distributed Processing with RabbitMQ

```javascript
const { adapters } = require('async-queue-manager');
const { RabbitMQAdapter } = adapters;

const rabbitAdapter = new RabbitMQAdapter({
  url: 'amqp://localhost',
  queue: 'tasks'
});

// Producer
await rabbitAdapter.connect();
await rabbitAdapter.sendTask('task1', { data: 'example' });

// Consumer
await rabbitAdapter.consume(async (task) => {
  // Process task
  return result;
});
```

## API Documentation

### TaskGraph

Manages task definitions and their dependencies.

- `addTask(taskId, taskFn, options)`: Add a task to the graph
- `addDependency(taskId, dependsOn)`: Define task dependencies
- `getReadyTasks()`: Get tasks ready for execution
- `markCompleted(taskId)`: Mark a task as completed
- `reset()`: Reset the task graph state
- `getTopologicalOrder()`: Get tasks in topological order

### QueueManager

Manages the execution of tasks based on the task graph.

- `start()`: Start processing tasks
- `pause()`: Pause task processing
- `resume()`: Resume task processing
- `stop()`: Stop task processing
- `reset()`: Reset the queue manager state
- `setConcurrency(value)`: Set concurrency level

Events: `task-start`, `task-complete`, `task-error`, `queue-complete`

### AdaptiveConcurrency

Automatically adjusts concurrency based on system resources.

- `start()`: Start monitoring and adjusting concurrency
- `stop()`: Stop monitoring

Events: `concurrency-update`, `metrics`

### Monitor

Provides real-time monitoring and a web dashboard.

- `start()`: Start the monitoring server
- `stop()`: Stop the monitoring server

Events: `started`, `stopped`, `client-connected`

## Configuration Options

### QueueManager Options

- `concurrency`: Number of concurrent tasks (default: 4)
- `autoStart`: Automatically start processing (default: false)
- `adaptiveConcurrency`: AdaptiveConcurrency instance

### AdaptiveConcurrency Options

- `minConcurrency`: Minimum concurrency level (default: 1)
- `maxConcurrency`: Maximum concurrency level
- `targetCpuUtilization`: Target CPU usage percentage (default: 70)
- `targetMemoryUtilization`: Target memory usage percentage (default: 70)
- `checkInterval`: Interval for checking system resources (ms)
- `adjustmentStep`: Step size for concurrency adjustments (default: 1)

### Monitor Options

- `port`: HTTP server port (default: 3000)
- `enableApi`: Enable REST API (default: true)
- `enableSockets`: Enable WebSocket support (default: true)
- `metricsInterval`: Interval for collecting metrics (ms) (default: 1000)

## Running Tests

```bash
npm test
```

For heavy load testing:

```bash
node test-heavy-load.js
```

For adaptive patterns testing:

```bash
node test-adaptive-patterns.js
```

## License

MIT

## Developer

Developed by Tisankan