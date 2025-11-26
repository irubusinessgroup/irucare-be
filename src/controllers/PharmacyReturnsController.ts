import {
  Body,
  Get,
  Path,
  Post,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import { Request as ExpressRequest } from "express";
import { PharmacyReturnsService } from "../services/PharmacyReturnsService";
import { IPaged, IResponse } from "../utils/interfaces/common";
import {
  CreateReturnRequest,
  ReturnResponse,
} from "../utils/interfaces/common";

@Tags("Pharmacy - Returns")
@Route("/api/pharmacy/returns")
export class PharmacyReturnsController {
  @Get("/")
  @Security("jwt")
  public async getReturns(
    @Query() page?: number,
    @Query() limit?: number,
    @Request() req?: ExpressRequest
  ): Promise<IPaged<ReturnResponse[]>> {
    const companyId = req?.user?.company?.companyId as string;
    return PharmacyReturnsService.getReturns(companyId, limit, page);
  }

  @Post("/")
  @Security("jwt")
  public async createReturn(
    @Body() data: CreateReturnRequest,
    @Request() req: ExpressRequest
  ): Promise<IResponse<ReturnResponse>> {
    const companyId = req.user?.company?.companyId as string;
    const userId = req.user?.id as string;
    return PharmacyReturnsService.createReturn(data, companyId, userId);
  }

  @Get("/{returnId}")
  @Security("jwt")
  public async getReturnById(
    @Path() returnId: string,
    @Request() req: ExpressRequest
  ): Promise<IResponse<ReturnResponse>> {
    const companyId = req.user?.company?.companyId as string;
    return PharmacyReturnsService.getReturnById(returnId, companyId);
  }
}
