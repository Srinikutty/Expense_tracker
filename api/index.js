const { app, initApp } = require('../server');

const initPromise = initApp();

module.exports = async (req, res) => {
  try {
    await initPromise;
    return app(req, res);
  } catch (error) {
    console.error('Serverless API initialization failed:', error);
    res.statusCode = 500;
    res.end('Server initialization failed');
  }
};
