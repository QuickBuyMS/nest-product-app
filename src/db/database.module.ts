import { Module, Global } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config();

@Global() // makes the provider available in all modules (no need to import everywhere)
@Module({
  providers: [
    {
      provide: 'DATABASE_CONNECTION',
      useFactory: async () => {
        const isRemoteHost = (process.env.DB_HOST || '').includes('tidbcloud.com') ||
                             (process.env.DB_HOST || '').includes('aivencloud.com');
        const useSsl = process.env.DB_SSL === 'true' || isRemoteHost;

        const pool = mysql.createPool({
          host: process.env.DB_HOST || 'localhost',
          user: process.env.DB_USER || 'root',
          database: process.env.DB_NAME || 'QuickBuy',
          password: process.env.DB_PASSWORD || '',
          port: Number(process.env.DB_PORT) || 3306,
          socketPath: process.env.DB_SOCKET_PATH || undefined,
          ssl: useSsl ? { rejectUnauthorized: false, minVersion: 'TLSv1.2' } : undefined,
          waitForConnections: true,
          connectionLimit: 10,
        });

        // Test connection
        const connection = await pool.getConnection();
        console.log('✅ Connected to MySQL');
        connection.release();

        return pool;
      },
    },
  ],
  exports: ['DATABASE_CONNECTION'],
})
export class DatabaseModule {}
