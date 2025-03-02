const { TaskGraph, QueueManager, RabbitMQAdapter } = require('../index');


const rabbitAdapter = new RabbitMQAdapter({
  url: 'amqp://localhost',
  exchangeName: 'task-exchange',
  queueName: 'task-queue',
  durable: true,
  prefetch: 1
});


const mode = process.argv[2] || 'producer';

if (mode === 'producer') {

  runProducer();
} else if (mode === 'consumer') {

  runConsumer();
} else {
  console.error('Invalid mode. Use "producer" or "consumer"');
  process.exit(1);
}

async function runProducer() {
  console.log('Starting in producer mode...');
  
  try {
    // Connect to RabbitMQ
    await rabbitAdapter.connect();
    console.log('Connected to RabbitMQ');
    
    // Create some example tasks
    const tasks = [
      {
        id: 'task1',
        type: 'calculation',
        payload: { operation: 'add', values: [10, 20] }
      },
      {
        id: 'task2',
        type: 'calculation',
        payload: { operation: 'multiply', values: [5, 7] }
      },
      {
        id: 'task3',
        type: 'text-processing',
        payload: { text: 'Hello, world!', operation: 'reverse' }
      },
      {
        id: 'task4',
        type: 'calculation',
        payload: { operation: 'fibonacci', value: 10 }
      },
      {
        id: 'task5',
        type: 'text-processing',
        payload: { text: 'async-queue-manager', operation: 'uppercase' }
      }
    ];
    
    // Set up event listeners
    rabbitAdapter.on('task-published', (task) => {
      console.log(`Published task ${task.id} to RabbitMQ`);
    });
    
    // Publish tasks to RabbitMQ
    for (const task of tasks) {
      await rabbitAdapter.publishTask(task);
    }
    
    console.log('All tasks published. Press Ctrl+C to exit.');
  } catch (error) {
    console.error('Error in producer:', error);
  }
}

async function runConsumer() {
  console.log('Starting in consumer mode...');
  
  try {
    // Connect to RabbitMQ
    await rabbitAdapter.connect();
    console.log('Connected to RabbitMQ');
    
    // Set up event listeners
    rabbitAdapter.on('task-received', (task) => {
      console.log(`Received task ${task.id} from RabbitMQ`);
    });
    
    rabbitAdapter.on('task-completed', ({ task, result }) => {
      console.log(`Completed task ${task.id} with result:`, result);
    });
    
    rabbitAdapter.on('task-error', ({ task, error }) => {
      console.error(`Error processing task ${task.id}:`, error);
    });
    
    // Start consuming tasks
    await rabbitAdapter.startConsuming(async (task) => {
      console.log(`Processing task ${task.id} of type ${task.type}...`);
      

      await new Promise(resolve => setTimeout(resolve, 1000));
      

      if (task.type === 'calculation') {
        return processCalculation(task.payload);
      } else if (task.type === 'text-processing') {
        return processText(task.payload);
      } else {
        throw new Error(`Unknown task type: ${task.type}`);
      }
    });
    
    console.log('Consumer started. Waiting for tasks. Press Ctrl+C to exit.');
  } catch (error) {
    console.error('Error in consumer:', error);
  }
}


function processCalculation(payload) {
  console.log('Processing calculation:', payload);
  
  switch (payload.operation) {
    case 'add':
      return { result: payload.values.reduce((a, b) => a + b, 0) };
    
    case 'multiply':
      return { result: payload.values.reduce((a, b) => a * b, 1) };
    
    case 'fibonacci':
      return { result: calculateFibonacci(payload.value) };
    
    default:
      throw new Error(`Unknown calculation operation: ${payload.operation}`);
  }
}

function processText(payload) {
  console.log('Processing text:', payload);
  
  switch (payload.operation) {
    case 'reverse':
      return { result: payload.text.split('').reverse().join('') };
    
    case 'uppercase':
      return { result: payload.text.toUpperCase() };
    
    case 'lowercase':
      return { result: payload.text.toLowerCase() };
    
    default:
      throw new Error(`Unknown text operation: ${payload.operation}`);
  }
}

function calculateFibonacci(n) {
  if (n <= 1) return n;
  
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    const temp = a + b;
    a = b;
    b = temp;
  }
  
  return b;
}


process.on('SIGINT', async () => {
  console.log('Shutting down...');
  
  try {
    if (mode === 'consumer') {
      await rabbitAdapter.stopConsuming();
    }
    
    await rabbitAdapter.disconnect();
    console.log('Disconnected from RabbitMQ');
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  
  process.exit(0);
});