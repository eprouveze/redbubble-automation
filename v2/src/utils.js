/**
 * Pause execution for a specified duration
 * 
 * @param {boolean} signalLogging Whether to log the pause
 * @param {number} duration Duration in seconds
 * @param {number} interval Logging interval in seconds
 */
function pause(signalLogging, duration, interval = 1) {
  return new Promise((resolve) => {
    if (signalLogging) {
      console.log(`Pausing for ${duration} seconds...`);
      const timer = setInterval(() => {
        console.log(`...${interval} seconds elapsed`);
      }, interval * 1000);
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, duration * 1000);
    } else {
      setTimeout(() => {
        resolve();
      }, duration * 1000);
    }
  });
}

module.exports = {
  pause
}; 