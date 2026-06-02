const { refreshCurrentAndNextYear } = require('../services/holidayService');

refreshCurrentAndNextYear()
  .then(() => {
    console.log('Holiday data synced for current and next year.');
  })
  .catch((error) => {
    console.error('Holiday sync failed:', error.message);
    process.exitCode = 1;
  });
