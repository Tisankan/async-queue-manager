const EventEmitter = require('events');
const amqp = require('amqplib');

class RabbitMQAdapter extends EventEmitter {

  constructor(options = {}) {
    super();
    
    this.url = options.url || 'amqp://localhost';
    this.exchangeName = options.exchangeName || 'task-exchange';
    this.queueName = options.queueName || 'task-queue';
    this.durable = options.durable !== false;
    this.prefetch = options.prefetch || 1;
    
    this.connection = null;
    this.channel = null;
    this.isConnected = false;
    this.isConsumer = false;
    this.isPublisher = false;
  }
  

  async connect() {
    if (this.isConnected) {
      return this;
    }
    
    try {

      this.connection = await amqp.connect(this.url);
      

      this.channel = await this.connection.createChannel();
      

      await this.channel.prefetch(this.prefetch);
      

      await this.channel.assertExchange(this.exchangeName, 'direct', {
        durable: this.durable
      });
      

      await this.channel.assertQueue(this.queueName, {
        durable: this.durable
      });
      

      await this.channel.bindQueue(this.queueName, this.exchangeName, this.queueName);
      

      this.connection.on('error', (err) => {
        this.isConnected = false;
        this.emit('error', err);
      });
      
      this.connection.on('close', () => {
        this.isConnected = false;
        this.emit('disconnected');
      });
      
      this.isConnected = true;
      this.emit('connected');
      
      return this;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  

  async disconnect() {
    if (!this.isConnected) {
      return this;
    }
    
    try {
      if (this.channel) {
        await this.channel.close();
      }
      
      if (this.connection) {
        await this.connection.close();
      }
      
      this.isConnected = false;
      this.isConsumer = false;
      this.isPublisher = false;
      this.emit('disconnected');
      
      return this;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  

  async startConsuming(taskHandler) {
    if (!this.isConnected) {
      await this.connect();
    }
    
    if (this.isConsumer) {
      return this;
    }
    
    try {

      await this.channel.consume(this.queueName, async (msg) => {
        if (!msg) return;
        
        try {

          const content = JSON.parse(msg.content.toString());
          

          this.emit('task-received', content);
          

          const result = await taskHandler(content);
          

          this.channel.ack(msg);
          

          this.emit('task-completed', { task: content, result });
        } catch (error) {

          this.channel.nack(msg, false, true);
          

          this.emit('task-error', { task: msg.content.toString(), error });
        }
      });
      
      this.isConsumer = true;
      this.emit('consumer-started');
      
      return this;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  

  async stopConsuming() {
    if (!this.isConnected || !this.isConsumer) {
      return this;
    }
    
    try {

      await this.channel.cancel(this.consumerTag);
      
      this.isConsumer = false;
      this.emit('consumer-stopped');
      
      return this;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  

  async publishTask(task, options = {}) {
    if (!this.isConnected) {
      await this.connect();
    }
    
    try {

      const content = Buffer.from(JSON.stringify(task));
      

      this.channel.publish(this.exchangeName, this.queueName, content, {
        persistent: this.durable,
        ...options
      });
      
      this.isPublisher = true;
      this.emit('task-published', task);
      
      return this;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  

  async getMessageCount() {
    if (!this.isConnected) {
      await this.connect();
    }
    
    try {
      const queueInfo = await this.channel.assertQueue(this.queueName, {
        durable: this.durable
      });
      
      return queueInfo.messageCount;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  

  async purgeQueue() {
    if (!this.isConnected) {
      await this.connect();
    }
    
    try {
      await this.channel.purgeQueue(this.queueName);
      this.emit('queue-purged');
      
      return this;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
}

module.exports = RabbitMQAdapter;