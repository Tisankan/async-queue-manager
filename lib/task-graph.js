class TaskGraph {
  constructor() {
    this.tasks = new Map();
    this.dependencies = new Map();
    this.dependents = new Map();
    this.completed = new Set();
  }


  addTask(taskId, taskFn, options = {}) {
    if (this.tasks.has(taskId)) {
      throw new Error(`Task with ID ${taskId} already exists`);
    }

    const task = typeof taskFn === 'function' 
      ? { execute: taskFn, ...options } 
      : { ...taskFn, ...options };

    this.tasks.set(taskId, task);
    this.dependencies.set(taskId, []);
    this.dependents.set(taskId, []);
    
    return this;
  }


  addDependency(taskId, dependsOn) {
    if (!this.tasks.has(taskId)) {
      throw new Error(`Task with ID ${taskId} does not exist`);
    }

    const dependencies = Array.isArray(dependsOn) ? dependsOn : [dependsOn];
    
    for (const depId of dependencies) {
      if (!this.tasks.has(depId)) {
        throw new Error(`Dependency task with ID ${depId} does not exist`);
      }


      if (this.wouldCreateCycle(depId, taskId)) {
        throw new Error(`Adding dependency from ${taskId} to ${depId} would create a cycle`);
      }


      if (!this.dependencies.get(taskId).includes(depId)) {
        this.dependencies.get(taskId).push(depId);
        this.dependents.get(depId).push(taskId);
      }
    }

    return this;
  }


  wouldCreateCycle(from, to) {
    const visited = new Set();
    const stack = [to];

    while (stack.length > 0) {
      const current = stack.pop();
      
      if (current === from) {
        return true;
      }

      if (!visited.has(current)) {
        visited.add(current);
        
        for (const dep of this.dependencies.get(current) || []) {
          stack.push(dep);
        }
      }
    }

    return false;
  }


  getReadyTasks() {
    const readyTasks = [];

    for (const [taskId, task] of this.tasks.entries()) {
      if (this.completed.has(taskId)) {
        continue;
      }

      const deps = this.dependencies.get(taskId) || [];
      const allDepsCompleted = deps.every(depId => this.completed.has(depId));

      if (allDepsCompleted) {
        readyTasks.push(taskId);
      }
    }

    return readyTasks;
  }


  markCompleted(taskId) {
    if (!this.tasks.has(taskId)) {
      throw new Error(`Task with ID ${taskId} does not exist`);
    }

    this.completed.add(taskId);
  }


  reset() {
    this.completed.clear();
  }


  isComplete() {
    return this.completed.size === this.tasks.size;
  }


  getTask(taskId) {
    if (!this.tasks.has(taskId)) {
      throw new Error(`Task with ID ${taskId} does not exist`);
    }
    
    return this.tasks.get(taskId);
  }


  getAllTasks() {
    return this.tasks;
  }


  getDependencies(taskId) {
    if (!this.tasks.has(taskId)) {
      throw new Error(`Task with ID ${taskId} does not exist`);
    }
    
    return this.dependencies.get(taskId);
  }


  getDependents(taskId) {
    if (!this.tasks.has(taskId)) {
      throw new Error(`Task with ID ${taskId} does not exist`);
    }
    
    return this.dependents.get(taskId);
  }


  /**
   * @returns {Array} - Array of task IDs in topological order
   */
  getTopologicalOrder() {
    const visited = new Set();
    const temp = new Set();
    const order = [];
    
    const visit = (taskId) => {
      if (temp.has(taskId)) {
        throw new Error('Graph has a cycle');
      }
      
      if (!visited.has(taskId)) {
        temp.add(taskId);
        
        const deps = this.dependencies.get(taskId) || [];
        for (const depId of deps) {
          visit(depId);
        }
        
        temp.delete(taskId);
        visited.add(taskId);
        order.push(taskId);
      }
    };
    
    for (const taskId of this.tasks.keys()) {
      if (!visited.has(taskId)) {
        visit(taskId);
      }
    }
    
    return order.reverse();
  }
}
module.exports = TaskGraph;