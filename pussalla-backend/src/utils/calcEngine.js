/**
 * Three task calculation engines used across the system.
 * `task` must contain: task_type (1|2|3), rate, base_limit (type 3 only)
 */
function calcEngine(task, totalOutput, workerCount) {
  const output = Number(totalOutput);
  const rate = Number(task.rate);

  if (task.task_type === 1) {
    const total = output * rate;
    return { total, perWorker: total };
  }

  if (task.task_type === 2) {
    const total = output * rate;
    return { total, perWorker: workerCount > 0 ? total / workerCount : 0 };
  }

  if (task.task_type === 3) {
    const excess = Math.max(0, output - Number(task.base_limit));
    const total = excess * rate;
    return { total, perWorker: workerCount > 0 ? total / workerCount : 0 };
  }

  throw new Error(`Unknown task_type: ${task.task_type}`);
}

module.exports = { calcEngine };
