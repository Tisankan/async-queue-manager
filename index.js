const TaskGraph = require('./lib/task-graph');
const QueueManager = require('./lib/queue-manager');
const AdaptiveConcurrency = require('./lib/adaptive-concurrency');
const Monitor = require('./lib/monitor');
const RabbitMQAdapter = require('./lib/adapters/rabbitmq-adapter');
const GRPCAdapter = require('./lib/adapters/grpc-adapter');

module.exports = {
  TaskGraph,
  QueueManager,
  AdaptiveConcurrency,
  Monitor,
  adapters: {
    RabbitMQAdapter,
    GRPCAdapter
  }
};