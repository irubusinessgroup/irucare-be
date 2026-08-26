import express from "express";
import { Controller, Get, Route, Tags, Security, Request, Query } from "tsoa";
import { prisma } from "../utils/client";
import { EbmService } from "../services/EbmService";

@Route("api/ebm/stock")
@Tags("EBM Stock")
export class EbmStockController extends Controller {
  @Get("sync")
  @Security("jwt", ["COMPANY_ADMIN", "ADMIN"])
  public async syncEbmStock(
    @Request() request: express.Request,
    @Query() lastReqDt: string,
  ): Promise<{ message: string; data: any; status: string }> {
    const user = request.user;

    if (!user?.company?.companyId) {
      this.setStatus(400);
      return {
        message: "User not associated with a company",
        data: null,
        status: "error",
      };
    }

    try {
      const company = await prisma.company.findUnique({
        where: { id: user.company.companyId },
        select: { TIN: true },
      });

      if (!company?.TIN) throw new Error("Company TIN is missing");

      const response = (await EbmService.fetchEbmStockItems(
        company.TIN,
        await EbmService.resolveCompanyBhfId(user.company.companyId),
        lastReqDt,
      )) as any;

      if (response.resultCd !== "000") {
        throw new Error(`EBM API Error: ${response.resultMsg}`);
      }

      return {
        message: "EBM stock items fetched successfully",
        data: response.data?.stockList || [],
        status: "success",
      };
    } catch (error: any) {
      console.error("syncEbmStock error:", error.message);
      this.setStatus(500);
      return {
        message: error.message || "Failed to fetch EBM stock items",
        data: null,
        status: "error",
      };
    }
  }
}
