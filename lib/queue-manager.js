const EventEmitter = require('events');

class QueueManager extends EventEmitter {

  constructor(taskGraph, options = {}) {
    super();
    
    this.taskGraph = taskGraph;
    this.concurrency = options.concurrency || 4;
    this.autoStart = options.autoStart || false;
    this.adaptiveConcurrency = options.adaptiveConcurrency || null;
    
    this.running = new Map();
    this.queue = [];
    this.isProcessing = false;
    this.isPaused = false;
    

    this.stats = {
      completed: 0,
      failed: 0,
      total: 0,
      startTime: null,
      endTime: null
    };
    

    this._initEvents();
    

    if (this.autoStart) {
      this.start();
    }
  }
  

  _initEvents() {

    if (this.adaptiveConcurrency) {
      this.adaptiveConcurrency.on('concurrency-update', (newConcurrency) => {
        this.setConcurrency(newConcurrency);
      });
    }
  }
  

  start() {
    if (this.isProcessing) {
      return this;
    }
    
    this.isProcessing = true;
    this.isPaused = false;
    this.stats.startTime = this.stats.startTime || Date.now();
    this.stats.total = this.taskGraph.getAllTasks().size;
    

    this._updateQueue();
    

    this._processQueue();
    
    return this;
  }
  

  pause() {
    this.isPaused = true;
    this.emit('paused');
    return this;
  }
  

  resume() {
    if (!this.isProcessing || !this.isPaused) {
      return this.start();
    }
    
    this.isPaused = false;
    this._processQueue();
    this.emit('resumed');
    
    return this;
  }
  

  async stop(waitForRunning = true) {
    this.isProcessing = false;
    this.queue = [];
    
    if (waitForRunning && this.running.size > 0) {

      await Promise.all(Array.from(this.running.values()));
    }
    
    this.stats.endTime = Date.now();
    this.emit('stopped');
    
    return this;
  }
  

  setConcurrency(concurrency) {
    if (typeof concurrency !== 'number' || concurrency < 1) {
      throw new Error('Concurrency must be a positive number');
    }
    
    this.concurrency = concurrency;
    this.emit('concurrency-changed', concurrency);
    

    if (this.isProcessing && !this.isPaused) {
      this._processQueue();
    }
    
    return this;
  }
  

  _updateQueue() {
    const readyTasks = this.taskGraph.getReadyTasks();
    

    for (const taskId of readyTasks) {
      if (!this.queue.includes(taskId) && !this.running.has(taskId)) {
        this.queue.push(taskId);
      }
    }
  }
  

  async _processQueue() {
    if (!this.isProcessing || this.isPaused) {
      return;
    }
    

    while (this.queue.length > 0 && this.running.size < this.concurrency) {
      const taskId = this.queue.shift();
      await this._executeTask(taskId);
    }
  }
  

  async _executeTask(taskId) {
    const task = this.taskGraph.getTask(taskId);
    

    const taskPromise = (async () => {
      try {
        this.emit('task-start', { taskId, task });
        

        const result = await task.execute(task);
        

        this.taskGraph.markCompleted(taskId);
        this.stats.completed++;
        
        this.emit('task-complete', { taskId, task, result });
        

        if (this.taskGraph.isComplete()) {
          this.stats.endTime = Date.now();
          this.emit('queue-complete', this.stats);
        }
      } catch (error) {
        this.stats.failed++;
        this.emit('task-error', { taskId, task, error });
      } finally {

        this.running.delete(taskId);
        

        this._updateQueue();
        this._processQueue();
      }
    })();
    

    this.running.set(taskId, taskPromise);
  }
  

  getStats() {
    return {
      ...this.stats,
      running: this.running.size,
      queued: this.queue.length,
      concurrency: this.concurrency,
      isProcessing: this.isProcessing,
      isPaused: this.isPaused,
      duration: this.stats.endTime 
        ? (this.stats.endTime - this.stats.startTime) 
        : (this.stats.startTime ? (Date.now() - this.stats.startTime) : 0)
    };
  }
  

  reset() {
    this.stop(false);
    this.taskGraph.reset();
    this.running.clear();
    this.queue = [];
    
    this.stats = {
      completed: 0,
      failed: 0,
      total: 0,
      startTime: null,
      endTime: null
    };
    
    this.emit('reset');
    
    return this;
  }
}

module.exports = QueueManager;