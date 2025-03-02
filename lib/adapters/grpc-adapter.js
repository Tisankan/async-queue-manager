/**
 * GRPCAdapter - Adapter for distributing tasks via gRPC
 * 
 * This module provides functionality to distribute tasks across multiple
 * processes or machines using gRPC for communication.
 */

const EventEmitter = require('events');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const fs = require('fs');

class GRPCAdapter extends EventEmitter {
  /**
   * Create a new GRPCAdapter
   * @param {Object} options - Configuration options
   * @param {string} options.protoPath - Path to the proto file (default: internal proto)
   * @param {string} options.serviceName - Name of the service in the proto file (default: TaskService)
   * @param {string} options.serverAddress - Address for the server (default: 0.0.0.0:50051)
   * @param {Object} options.credentials - gRPC credentials (default: insecure)
   */
  constructor(options = {}) {
    super();
    
    // Default proto file path (create if not provided)
    this.protoPath = options.protoPath || this._createDefaultProtoFile();
    this.serviceName = options.serviceName || 'TaskService';
    this.serverAddress = options.serverAddress || '0.0.0.0:50051';
    this.credentials = options.credentials || grpc.ServerCredentials.createInsecure();
    
    this.server = null;
    this.client = null;
    this.packageDefinition = null;
    this.protoDescriptor = null;
    this.isServerRunning = false;
    this.isClientConnected = false;
    
    // Task handler function
    this.taskHandler = null;
  }
  
  /**
   * Create a default proto file if none is provided
   * @private
   * @returns {string} - Path to the created proto file
   */
  _createDefaultProtoFile() {
    const protoDir = path.join(__dirname, '..', '..', 'proto');
    const protoPath = path.join(protoDir, 'task_service.proto');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(protoDir)) {
      fs.mkdirSync(protoDir, { recursive: true });
    }
    
    // Create proto file if it doesn't exist
    if (!fs.existsSync(protoPath)) {
      const protoContent = `syntax = "proto3";

package taskservice;

service TaskService {
  rpc ExecuteTask (TaskRequest) returns (TaskResponse);
  rpc SubmitTask (TaskRequest) returns (SubmitResponse);
  rpc GetTaskStatus (TaskStatusRequest) returns (TaskStatusResponse);
  rpc StreamTaskUpdates (TaskStatusRequest) returns (stream TaskStatusUpdate);
}

message TaskRequest {
  string task_id = 1;
  string task_type = 2;
  bytes payload = 3;
  map<string, string> metadata = 4;
}

message TaskResponse {
  string task_id = 1;
  bool success = 2;
  bytes result = 3;
  string error = 4;
}

message SubmitResponse {
  string task_id = 1;
  bool accepted = 2;
  string message = 3;
}

message TaskStatusRequest {
  string task_id = 1;
}

message TaskStatusResponse {
  string task_id = 1;
  string status = 2; // pending, running, completed, failed
  double progress = 3;
  string message = 4;
}

message TaskStatusUpdate {
  string task_id = 1;
  string status = 2;
  double progress = 3;
  string message = 4;
  int64 timestamp = 5;
}
`;
      
      fs.writeFileSync(protoPath, protoContent);
    }
    
    return protoPath;
  }
  
  /**
   * Load the proto file and create service definitions
   * @private
   */
  _loadProtoDefinitions() {
    if (this.protoDescriptor) {
      return;
    }
    
    // Load the proto file
    this.packageDefinition = protoLoader.loadSync(this.protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });
    
    // Load the package definition
    this.protoDescriptor = grpc.loadPackageDefinition(this.packageDefinition);
  }
  
  /**
   * Start the gRPC server
   * @param {Function} taskHandler - Function to handle received tasks
   * @returns {Promise} - Resolves when server is started
   */
  async startServer(taskHandler) {
    if (this.isServerRunning) {
      return this;
    }
    
    this._loadProtoDefinitions();
    this.taskHandler = taskHandler;
    
    return new Promise((resolve, reject) => {
      try {
        // Create a new server
        this.server = new grpc.Server();
        
        // Get the service definition
        const serviceDefinition = this.protoDescriptor.taskservice[this.serviceName].service;
        
        // Implement the service methods
        this.server.addService(serviceDefinition, {
          executeTask: this._handleExecuteTask.bind(this),
          submitTask: this._handleSubmitTask.bind(this),
          getTaskStatus: this._handleGetTaskStatus.bind(this),
          streamTaskUpdates: this._handleStreamTaskUpdates.bind(this)
        });
        
        // Start the server
        this.server.bindAsync(this.serverAddress, this.credentials, (err) => {
          if (err) {
            this.emit('error', err);
            reject(err);
            return;
          }
          
          this.server.start();
          this.isServerRunning = true;
          this.emit('server-started', { address: this.serverAddress });
          resolve(this);
        });
      } catch (error) {
        this.emit('error', error);
        reject(error);
      }
    });
  }
  
  /**
   * Stop the gRPC server
   * @returns {Promise} - Resolves when server is stopped
   */
  async stopServer() {
    if (!this.isServerRunning || !this.server) {
      return this;
    }
    
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        this.isServerRunning = false;
        this.emit('server-stopped');
        resolve(this);
      });
    });
  }
  
  /**
   * Connect to a gRPC server as a client
   * @param {string} serverAddress - Address of the server to connect to
   * @returns {GRPCAdapter} - Returns this for chaining
   */
  connectClient(serverAddress = null) {
    if (this.isClientConnected) {
      return this;
    }
    
    this._loadProtoDefinitions();
    
    const address = serverAddress || this.serverAddress;
    
    // Create a client
    this.client = new this.protoDescriptor.taskservice[this.serviceName](
      address,
      grpc.credentials.createInsecure()
    );
    
    this.isClientConnected = true;
    this.emit('client-connected', { address });
    
    return this;
  }
  
  /**
   * Disconnect the client
   * @returns {GRPCAdapter} - Returns this for chaining
   */
  disconnectClient() {
    if (!this.isClientConnected || !this.client) {
      return this;
    }
    
    grpc.closeClient(this.client);
    this.client = null;
    this.isClientConnected = false;
    this.emit('client-disconnected');
    
    return this;
  }
  
  /**
   * Submit a task to the server
   * @param {Object} task - Task to submit
   * @returns {Promise} - Resolves with the response
   */
  submitTask(task) {
    if (!this.isClientConnected) {
      throw new Error('Client is not connected');
    }
    
    return new Promise((resolve, reject) => {
      // Prepare the request
      const request = {
        task_id: task.id || `task-${Date.now()}`,
        task_type: task.type || 'default',
        payload: Buffer.from(JSON.stringify(task.payload || {})),
        metadata: task.metadata || {}
      };
      
      // Submit the task
      this.client.submitTask(request, (error, response) => {
        if (error) {
          this.emit('task-submit-error', { task, error });
          reject(error);
          return;
        }
        
        this.emit('task-submitted', { task, response });
        resolve(response);
      });
    });
  }
  
  /**
   * Execute a task on the server
   * @param {Object} task - Task to execute
   * @returns {Promise} - Resolves with the response
   */
  executeTask(task) {
    if (!this.isClientConnected) {
      throw new Error('Client is not connected');
    }
    
    return new Promise((resolve, reject) => {
      // Prepare the request
      const request = {
        task_id: task.id || `task-${Date.now()}`,
        task_type: task.type || 'default',
        payload: Buffer.from(JSON.stringify(task.payload || {})),
        metadata: task.metadata || {}
      };
      
      // Execute the task
      this.client.executeTask(request, (error, response) => {
        if (error) {
          this.emit('task-execute-error', { task, error });
          reject(error);
          return;
        }
        
        this.emit('task-executed', { task, response });
        resolve(response);
      });
    });
  }
  
  /**
   * Get the status of a task
   * @param {string} taskId - ID of the task
   * @returns {Promise} - Resolves with the task status
   */
  getTaskStatus(taskId) {
    if (!this.isClientConnected) {
      throw new Error('Client is not connected');
    }
    
    return new Promise((resolve, reject) => {
      this.client.getTaskStatus({ task_id: taskId }, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        
        resolve(response);
      });
    });
  }
  
  /**
   * Stream task updates from the server
   * @param {string} taskId - ID of the task to stream updates for
   * @returns {Object} - Stream object
   */
  streamTaskUpdates(taskId) {
    if (!this.isClientConnected) {
      throw new Error('Client is not connected');
    }
    
    const stream = this.client.streamTaskUpdates({ task_id: taskId });
    
    stream.on('data', (update) => {
      this.emit('task-update', update);
    });
    
    stream.on('error', (error) => {
      this.emit('stream-error', error);
    });
    
    stream.on('end', () => {
      this.emit('stream-end', { taskId });
    });
    
    return stream;
  }
  
  /**
   * Handle executeTask RPC method
   * @private
   */
  async _handleExecuteTask(call, callback) {
    try {
      const request = call.request;
      
      // Parse the payload
      const payload = JSON.parse(request.payload.toString());
      
      // Create a task object
      const task = {
        id: request.task_id,
        type: request.task_type,
        payload,
        metadata: request.metadata
      };
      
      this.emit('task-received', task);
      
      // Execute the task
      if (!this.taskHandler) {
        throw new Error('No task handler registered');
      }
      
      const result = await this.taskHandler(task);
      
      // Send the response
      callback(null, {
        task_id: request.task_id,
        success: true,
        result: Buffer.from(JSON.stringify(result)),
        error: ''
      });
      
      this.emit('task-completed', { task, result });
    } catch (error) {
      callback(null, {
        task_id: call.request.task_id,
        success: false,
        result: Buffer.from('{}'),
        error: error.message
      });
      
      this.emit('task-error', { task: call.request, error });
    }
  }
  
  /**
   * Handle submitTask RPC method
   * @private
   */
  _handleSubmitTask(call, callback) {
    const request = call.request;
    
    // Accept the task
    callback(null, {
      task_id: request.task_id,
      accepted: true,
      message: 'Task accepted'
    });
    
    // Process the task asynchronously
    setImmediate(async () => {
      try {
        // Parse the payload
        const payload = JSON.parse(request.payload.toString());
        
        // Create a task object
        const task = {
          id: request.task_id,
          type: request.task_type,
          payload,
          metadata: request.metadata
        };
        
        this.emit('task-received', task);
        
        // Execute the task
        if (!this.taskHandler) {
          throw new Error('No task handler registered');
        }
        
        const result = await this.taskHandler(task);
        this.emit('task-completed', { task, result });
      } catch (error) {
        this.emit('task-error', { task: request, error });
      }
    });
  }
  
  /**
   * Handle getTaskStatus RPC method
   * @private
   */
  _handleGetTaskStatus(call, callback) {
    // This would typically check a task store or database
    // For now, we'll just return a mock response
    const taskId = call.request.task_id;
    
    // Mock response with a default status
    callback(null, {
      task_id: taskId,
      status: 'completed', // Default status for mock response
      progress: 100,
      message: 'Task completed successfully'
    });
    
    this.emit('task-status-requested', { taskId });
  }
  
  /**
   * Handle streamTaskUpdates RPC method
   * @private
   */
  _handleStreamTaskUpdates(call) {
    const taskId = call.request.task_id;
    this.emit('stream-started', { taskId });
    
    // For demonstration, send a series of updates
    // In a real implementation, this would be connected to actual task progress
    let progress = 0;
    const statusUpdates = ['pending', 'running', 'running', 'completed'];
    const messages = ['Task queued', 'Task started', 'Task in progress', 'Task completed'];
    
    // Send initial status
    call.write({
      task_id: taskId,
      status: statusUpdates[0],
      progress: progress,
      message: messages[0],
      timestamp: Date.now()
    });
    
    // Setup interval to send periodic updates
    const interval = setInterval(() => {
      progress += 33;
      const index = Math.min(Math.floor(progress / 33), statusUpdates.length - 1);
      
      call.write({
        task_id: taskId,
        status: statusUpdates[index],
        progress: Math.min(progress, 100),
        message: messages[index],
        timestamp: Date.now()
      });
      
      // End the stream when we reach 100%
      if (progress >= 100) {
        clearInterval(interval);
        call.end();
        this.emit('stream-ended', { taskId });
      }
    }, 1000);
    
    // Handle client disconnect
    call.on('cancelled', () => {
      clearInterval(interval);
      this.emit('stream-cancelled', { taskId });
    });
    
    call.on('error', (error) => {
      clearInterval(interval);
      this.emit('stream-error', { taskId, error });
    });
  } }
module.exports = GRPCAdapter;
