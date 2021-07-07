module.exports = {
    filgreen: {
      start: process.env.START_BLOCK || 0,
      filscraper_api: process.env.FILSCRAPER_API || '',
      api_port: process.env.API_PORT || 3000
    },
    database: {
        user: process.env.DB_USER || '',
        host: process.env.DB_HOST || '',
        database: process.env.DB_NAME || '',
        password: process.env.DB_PASSWORD || '',
        port: process.env.DB_PORT || 5432
      },
    lotus: {
      api: process.env.LOTUS_API || '',
      token: process.env.LOTUS_TOKEN || ''
    }
  };