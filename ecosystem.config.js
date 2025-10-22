module.exports = {
    apps: [{
      name: 'shopify-app',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/shopify-app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'file:/var/www/shopify-app/prisma/prod.sqlite',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }]
  };