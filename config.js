module.exports = {
    filgreen: {
      api_port: process.env.API_PORT || 3000,
      epochs_gap: process.env.EPOCHS_GAP || 1440, //12 hours
      limit: process.env.LIMIT || 1000,
    },
    database: {
        user: process.env.DB_USER || '',
        host: process.env.DB_HOST || '',
        database: process.env.DB_NAME || '',
        password: process.env.DB_PASSWORD || '',
        port: process.env.DB_PORT || 5432
      }
  };