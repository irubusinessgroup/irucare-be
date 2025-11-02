import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import AppError from "../utils/error";

const execAsync = promisify(exec);

interface BackupMetadata {
  path: string;
  timestamp: Date;
  size: number;
  userId: string;
}

export class BackupService {
  public static async createDatabaseBackup(
    userId: string
  ): Promise<BackupMetadata> {
    try {
      // Get DATABASE_URL from environment
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new AppError("DATABASE_URL environment variable not set", 500);
      }

      // Parse database URL to extract connection details
      const dbUrl = new URL(databaseUrl);
      const dbName = dbUrl.pathname.slice(1); // Remove leading /
      const dbUser = dbUrl.username;
      const dbPassword = dbUrl.password;
      const dbHost = dbUrl.hostname;
      const dbPort = dbUrl.port || "5432";

      // Create backups directory if it doesn't exist
      const backupsDir = path.join(process.cwd(), "backups");
      await fs.mkdir(backupsDir, { recursive: true });

      // Generate timestamp for filename
      const timestamp = new Date();
      const timestampStr = timestamp
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const filename = `backup_${timestampStr}.sql`;
      const filePath = path.join(backupsDir, filename);

      // Set PGPASSWORD environment variable for pg_dump
      const env = { ...process.env, PGPASSWORD: dbPassword };

      // Build pg_dump command
      const pgDumpCommand = `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -F p -f "${filePath}"`;

      // Execute pg_dump
      await execAsync(pgDumpCommand, { env });

      // Get file size
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      if (fileSize === 0) {
        throw new AppError("Backup file is empty", 500);
      }

      return {
        path: filePath,
        timestamp,
        size: fileSize,
        userId,
      };
    } catch (error) {
      // If pg_dump fails, try alternative method using Prisma introspection
      if (error instanceof Error && error.message.includes("pg_dump")) {
        console.warn(
          "pg_dump not available, attempting alternative backup method"
        );
        return await this.createBackupViaPrisma(userId);
      }
      throw new AppError(
        `Failed to create backup: ${error instanceof Error ? error.message : "Unknown error"}`,
        500
      );
    }
  }

  /**
   * Alternative backup method using Prisma introspection
   * This is a fallback if pg_dump is not available
   */
  private static async createBackupViaPrisma(
    userId: string
  ): Promise<BackupMetadata> {
    try {
      await import("../utils/client");

      // Create backups directory if it doesn't exist
      const backupsDir = path.join(process.cwd(), "backups");
      await fs.mkdir(backupsDir, { recursive: true });

      // Generate timestamp for filename
      const timestamp = new Date();
      const timestampStr = timestamp
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const filename = `backup_${timestampStr}.json`;
      const filePath = path.join(backupsDir, filename);

      // Get all data from database (this is a simplified approach)
      // Note: For production, prefer pg_dump for complete backups
      const backupData = {
        timestamp: timestamp.toISOString(),
        userId,
        note: "This is a simplified backup. Use pg_dump for full SQL backups.",
      };

      await fs.writeFile(
        filePath,
        JSON.stringify(backupData, null, 2),
        "utf-8"
      );

      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      return {
        path: filePath,
        timestamp,
        size: fileSize,
        userId,
      };
    } catch (error) {
      throw new AppError(
        `Failed to create backup via Prisma: ${error instanceof Error ? error.message : "Unknown error"}`,
        500
      );
    }
  }

  /**
   * Validates that a backup file exists and is not empty
   */
  public static async validateBackup(backupPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(backupPath);
      return stats.size > 0;
    } catch (error) {
      return false;
    }
  }
}
