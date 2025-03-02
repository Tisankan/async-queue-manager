const EventEmitter = require('events');
const os = require('os');
const osUtils = require('node-os-utils');

class AdaptiveConcurrency extends EventEmitter {

  constructor(options = {}) {
    super();
    
    this.minConcurrency = options.minConcurrency || 1;
    this.maxConcurrency = options.maxConcurrency || os.cpus().length;
    this.targetCpuUtilization = options.targetCpuUtilization || 70;
    this.targetMemoryUtilization = options.targetMemoryUtilization || 80;
    this.checkInterval = options.checkInterval || 5000;
    this.adjustmentStep = options.adjustmentStep || 1;
    
    this.currentConcurrency = this.maxConcurrency;
    this.isMonitoring = false;
    this.monitorInterval = null;
    

    this.cpu = osUtils.cpu;
    this.mem = osUtils.mem;
    

    this.metricsHistory = {
      cpu: [],
      memory: []
    };
    this.historySize = 3;
  }
  

  start() {
    if (this.isMonitoring) {
      return this;
    }
    
    this.isMonitoring = true;
    this.monitorInterval = setInterval(() => this._checkResources(), this.checkInterval);
    
    return this;
  }
  

  stop() {
    if (!this.isMonitoring) {
      return this;
    }
    
    this.isMonitoring = false;
    clearInterval(this.monitorInterval);
    this.monitorInterval = null;
    
    return this;
  }
  

  async _checkResources() {
    try {

      const [cpuUsage, memoryInfo] = await Promise.all([
        this.cpu.usage(),
        this.mem.info()
      ]);
      
      const memoryUsage = 100 - memoryInfo.freeMemPercentage;
      

      this._addMetric('cpu', cpuUsage);
      this._addMetric('memory', memoryUsage);
      

      const avgCpuUsage = this._getAverageMetric('cpu');
      const avgMemoryUsage = this._getAverageMetric('memory');
      

      let newConcurrency = this.currentConcurrency;
      

      if (avgCpuUsage > this.targetCpuUtilization + 10) {

        newConcurrency -= this.adjustmentStep;
      } else if (avgCpuUsage < this.targetCpuUtilization - 10 && avgMemoryUsage < this.targetMemoryUtilization) {

        newConcurrency += this.adjustmentStep;
      }
      

      if (avgMemoryUsage > this.targetMemoryUtilization + 10) {

        newConcurrency -= this.adjustmentStep;
      }
      

      newConcurrency = Math.max(this.minConcurrency, Math.min(this.maxConcurrency, newConcurrency));
      

      if (newConcurrency !== this.currentConcurrency) {
        const previousConcurrency = this.currentConcurrency;
        this.currentConcurrency = newConcurrency;
        this.emit('concurrency-update', newConcurrency);
        

        this.emit('metrics', {
          timestamp: Date.now(),
          cpuUsage: avgCpuUsage,
          memoryUsage: avgMemoryUsage,
          newConcurrency,
          previousConcurrency
        });
      }
    } catch (error) {
      this.emit('error', error);
    }
  }
  

  _addMetric(type, value) {
    this.metricsHistory[type].push(value);
    

    if (this.metricsHistory[type].length > this.historySize) {
      this.metricsHistory[type].shift();
    }
  }
  

  _getAverageMetric(type) {
    const metrics = this.metricsHistory[type];
    
    if (metrics.length === 0) {
      return 0;
    }
    
    const sum = metrics.reduce((acc, val) => acc + val, 0);
    return sum / metrics.length;
  }
  

  async getMetrics() {
    const [cpuUsage, memoryInfo] = await Promise.all([
      this.cpu.usage(),
      this.mem.info()
    ]);
    
    const memoryUsage = 100 - memoryInfo.freeMemPercentage;
    
    return {
      timestamp: Date.now(),
      cpu: {
        usage: cpuUsage,
        cores: os.cpus().length
      },
      memory: {
        usage: memoryUsage,
        total: os.totalmem(),
        free: os.freemem()
      },
      concurrency: this.currentConcurrency
    };
  }
  
  /**
   * Manually set the concurrency level
   * @param {number} concurrency - New concurrency level
   * @returns {AdaptiveConcurrency} - Returns this for chaining
   */
  setConcurrency(concurrency) {
    const newConcurrency = Math.max(this.minConcurrency, Math.min(this.maxConcurrency, concurrency));
    
    if (newConcurrency !== this.currentConcurrency) {
      this.currentConcurrency = newConcurrency;
      this.emit('concurrency-update', newConcurrency);
    }
    
    return this;
  }
}

module.exports = AdaptiveConcurrency;