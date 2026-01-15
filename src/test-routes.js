const express = require('express');
const router = express.Router();

router.get('/test-execute', async (req, res) => {
  console.log('\n🧪 [TEST] Route /test-execute chamada');
  res.json({ message: 'teste OK' });
});

module.exports = router;
