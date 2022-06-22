module.exports = {
    filgreen: {
      api_port: process.env.API_PORT || 3000,
      limit: process.env.LIMIT || 1000,
      max_limit: process.env.MAX_LIMIT || 10000,
    },
    database: {
        user: process.env.DB_USER || '',
        host: process.env.DB_HOST || '',
        database: process.env.DB_NAME || '',
        password: process.env.DB_PASSWORD || '',
        port: process.env.DB_PORT || 5432
      }
  };