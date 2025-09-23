import { config } from "dotenv";

// Load environment variables from .env file in development
if (process.env.NODE_ENV !== "production") {
  config();
}

// Validate required environment variables
const requiredEnvVars = [
  'SHOPIFY_API_KEY',
  'SHOPIFY_API_SECRET',
  'SHOPIFY_APP_URL'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(envVar => {
    console.error(`   - ${envVar}`);
  });
  console.error('\n💡 Please check your .env file or system environment variables.');
  process.exit(1);
}

// Log environment configuration (without sensitive data)
console.log('✅ Environment variables loaded:');
console.log(`   - SHOPIFY_API_KEY: ${process.env.SHOPIFY_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`   - SHOPIFY_API_SECRET: ${process.env.SHOPIFY_API_SECRET ? '✅ Set' : '❌ Missing'}`);
console.log(`   - SHOPIFY_APP_URL: ${process.env.SHOPIFY_APP_URL || '❌ Missing'}`);
console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

export default process.env;
