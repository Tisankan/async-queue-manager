const EventEmitter = require('events');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const os = require('os');

class Monitor extends EventEmitter {

  constructor(queueManager, options = {}) {
    super();
    
    this.queueManager = queueManager;
    this.port = options.port || 3000;
    this.enableApi = options.enableApi !== false;
    this.enableSockets = options.enableSockets !== false;
    this.metricsInterval = options.metricsInterval || 1000;
    
    this.app = null;
    this.server = null;
    this.io = null;
    this.metricsTimer = null;
    this.isRunning = false;
    

    this.metricsHistory = [];
    this.maxHistorySize = 100;
    

    this._bindEvents();
  }
  

  async start() {
    if (this.isRunning) {
      return this;
    }
    

    if (this.enableApi) {
      this.app = express();
      this.server = http.createServer(this.app);
      

      this._setupApiRoutes();
    }
    

    if (this.enableSockets && this.server) {
      this.io = socketIo(this.server, {
        cors: {
          origin: '*',
          methods: ['GET', 'POST']
        }
      });
      
      this._setupSocketHandlers();
    }
    

    this._startMetricsCollection();
    

    if (this.enableApi && this.server) {
      await new Promise((resolve) => {
        this.server.listen(this.port, () => {
          this.isRunning = true;
          this.emit('started', { port: this.port });
          resolve();
        });
      });
    } else {
      this.isRunning = true;
      this.emit('started', { metricsOnly: true });
    }
    
    return this;
  }
  

  async stop() {
    if (!this.isRunning) {
      return this;
    }
    

    this._stopMetricsCollection();
    

    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(() => {
          resolve();
        });
      });
    }
    

    if (this.io) {
      await new Promise((resolve) => {
        this.io.close(() => {
          resolve();
        });
      });
    }
    
    this.isRunning = false;
    this.emit('stopped');
    
    return this;
  }
  

  _bindEvents() {
    const qm = this.queueManager;
    

    qm.on('task-start', (data) => {
      this.emit('task-start', data);
      this._broadcastEvent('task-start', data);
    });
    
    qm.on('task-complete', (data) => {
      this.emit('task-complete', data);
      this._broadcastEvent('task-complete', data);
    });
    
    qm.on('task-error', (data) => {
      this.emit('task-error', data);
      this._broadcastEvent('task-error', data);
    });
    

    qm.on('queue-complete', (stats) => {
      this.emit('queue-complete', stats);
      this._broadcastEvent('queue-complete', stats);
    });
    
    qm.on('paused', () => {
      this.emit('queue-paused');
      this._broadcastEvent('queue-paused', {});
    });
    
    qm.on('resumed', () => {
      this.emit('queue-resumed');
      this._broadcastEvent('queue-resumed', {});
    });
    
    qm.on('stopped', () => {
      this.emit('queue-stopped');
      this._broadcastEvent('queue-stopped', {});
    });
    
    qm.on('reset', () => {
      this.emit('queue-reset');
      this._broadcastEvent('queue-reset', {});
    });
    

    qm.on('concurrency-changed', (concurrency) => {
      this.emit('concurrency-changed', { concurrency });
      this._broadcastEvent('concurrency-changed', { concurrency });
    });
  }
  

  _setupApiRoutes() {
    const app = this.app;
    

    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });
    
    app.use(express.static('dashboard'));
    
    app.get('/api/stats', (req, res) => {
      res.json(this.queueManager.getStats());
    });
    
    app.get('/api/metrics', (req, res) => {
      res.json(this.metricsHistory);
    });
    
    app.get('/api/tasks', (req, res) => {
      const tasks = Array.from(this.queueManager.taskGraph.getAllTasks().entries())
        .map(([id, task]) => ({
          id,
          completed: this.queueManager.taskGraph.completed.has(id),
          running: this.queueManager.running.has(id),
          dependencies: this.queueManager.taskGraph.getDependencies(id),
          dependents: this.queueManager.taskGraph.getDependents(id)
        }));
      
      res.json(tasks);
    });
    
    app.get('/api/system', async (req, res) => {
      const cpuCount = os.cpus().length;
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      
      res.json({
        cpu: {
          count: cpuCount,
          model: os.cpus()[0].model,
          load: os.loadavg()
        },
        memory: {
          total: totalMem,
          free: freeMem,
          used: totalMem - freeMem,
          usedPercentage: ((totalMem - freeMem) / totalMem) * 100
        },
        os: {
          platform: os.platform(),
          release: os.release(),
          uptime: os.uptime()
        }
      });
    });
    

    app.post('/api/control/pause', (req, res) => {
      this.queueManager.pause();
      res.json({ status: 'paused' });
    });
    
    app.post('/api/control/resume', (req, res) => {
      this.queueManager.resume();
      res.json({ status: 'resumed' });
    });
    
    app.post('/api/control/stop', (req, res) => {
      this.queueManager.stop();
      res.json({ status: 'stopped' });
    });
    
    app.post('/api/control/reset', (req, res) => {
      this.queueManager.reset();
      res.json({ status: 'reset' });
    });
    
    app.post('/api/control/concurrency', express.json(), (req, res) => {
      const { concurrency } = req.body;
      
      if (typeof concurrency !== 'number' || concurrency < 1) {
        return res.status(400).json({ error: 'Concurrency must be a positive number' });
      }
      
      this.queueManager.setConcurrency(concurrency);
      res.json({ concurrency });
    });
  }
  

  _setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      this.emit('client-connected', { socketId: socket.id });
      

      socket.emit('stats', this.queueManager.getStats());
      socket.emit('tasks', Array.from(this.queueManager.taskGraph.getAllTasks().keys()));
      

      socket.on('pause', () => {
        this.queueManager.pause();
      });
      
      socket.on('resume', () => {
        this.queueManager.resume();
      });
      
      socket.on('stop', () => {
        this.queueManager.stop();
      });
      
      socket.on('reset', () => {
        this.queueManager.reset();
      });
      
      socket.on('set-concurrency', (concurrency) => {
        if (typeof concurrency === 'number' && concurrency >= 1) {
          this.queueManager.setConcurrency(concurrency);
        }
      });
      
      socket.on('disconnect', () => {
        this.emit('client-disconnected', { socketId: socket.id });
      });
    });
  }
  

  _startMetricsCollection() {
    if (this.metricsTimer) {
      return;
    }
    
    this.metricsTimer = setInterval(() => {
      const stats = this.queueManager.getStats();
      const timestamp = Date.now();
      

      const cpuCount = os.cpus().length;
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memUsage = ((totalMem - freeMem) / totalMem) * 100;
      
      const metrics = {
        timestamp,
        stats,
        system: {
          cpu: {
            count: cpuCount,
            load: os.loadavg()[0] / cpuCount * 100
          },
          memory: {
            usage: memUsage,
            total: totalMem,
            free: freeMem
          }
        }
      };
      

      this.metricsHistory.push(metrics);
      

      if (this.metricsHistory.length > this.maxHistorySize) {
        this.metricsHistory.shift();
      }
      

      this._broadcastEvent('metrics', metrics);
      
      this.emit('metrics', metrics);
    }, this.metricsInterval);
  }
  

  _stopMetricsCollection() {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }
  

  _broadcastEvent(event, data) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }
  

  getMetrics() {
    return this.metricsHistory.length > 0 
      ? this.metricsHistory[this.metricsHistory.length - 1] 
      : null;
  }
  

  getMetricsHistory() {
    return this.metricsHistory;
  }
  

  clearMetricsHistory() {
    this.metricsHistory = [];
  }
}

module.exports = Monitor;