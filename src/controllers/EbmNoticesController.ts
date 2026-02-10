import {
  Route,
  Post,
  Get,
  Body,
  Request,
  Security,
  Tags,
  Controller,
} from "tsoa";
import express from "express";
import { EbmNoticeService } from "../services/EbmNoticeService";

interface SyncNoticesRequest {
  companyId: string;
}

interface SyncNoticesResponse {
  message: string;
  status: string;
}

@Route("ebm/notices")
@Tags("EBM Notices")
export class EbmNoticesController extends Controller {
  /**
   * Manually sync EBM notices for a specific company (Admin only)
   * @summary Sync EBM notices for a company
   */
  @Post("sync")
  @Security("jwt", ["ADMIN", "COMPANY_ADMIN"])
  public async syncNotices(
    @Body() body: SyncNoticesRequest,
    @Request() request: express.Request,
  ): Promise<SyncNoticesResponse> {
    const io = request.app.get("io");

    if (!io) {
      this.setStatus(500);
      return {
        message: "Socket.IO not configured",
        status: "error",
      };
    }

    try {
      await EbmNoticeService.syncNotices(body.companyId, io);
      return {
        message: "EBM notices synced successfully",
        status: "success",
      };
    } catch (error: any) {
      this.setStatus(500);
      return {
        message: error.message || "Failed to sync EBM notices",
        status: "error",
      };
    }
  }

  /**
   * Refresh notices for current user's company
   * @summary Refresh EBM notices for logged-in user's company
   */
  @Get("refresh")
  @Security("jwt")
  public async refreshNotices(
    @Request() request: express.Request,
  ): Promise<SyncNoticesResponse> {
    const user = request.user;

    if (!user?.company?.companyId) {
      this.setStatus(400);
      return {
        message: "User not associated with a company",
        status: "error",
      };
    }

    const io = request.app.get("io");

    if (!io) {
      this.setStatus(500);
      return {
        message: "Socket.IO not configured",
        status: "error",
      };
    }

    try {
      await EbmNoticeService.syncNotices(user.company.companyId, io);
      return {
        message: "EBM notices refreshed successfully",
        status: "success",
      };
    } catch (error: any) {
      this.setStatus(500);
      return {
        message: error.message || "Failed to refresh EBM notices",
        status: "error",
      };
    }
  }
}
