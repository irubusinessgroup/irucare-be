/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Get,
  Path,
  Query,
  Request,
  Route,
  Tags,
  Security,
  Middlewares,
} from "tsoa";
import { Request as ExpressRequest } from "express";
import { TransactionService } from "../services/TransactionService";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Tags("Transactions")
@Route("/api/transactions")
@Security("jwt")
export class TransactionController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public async getAll(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
    @Query() isTrainingMode?: boolean,
  ): Promise<any> {
    return TransactionService.getAllTransactions(
      req,
      searchq,
      limit,
      page,
      dateFrom,
      dateTo,
      isTrainingMode,
    );
  }

  @Get("/last-z-report")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public async getLastZReportDate(
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return TransactionService.getLastZReportDate(req);
  }

  @Get("/x-report")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getXReport(
    @Request() req: ExpressRequest,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
  ) {
    return TransactionService.getXReport(req, dateFrom, dateTo);
  }

  @Get("/z-report")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getZReport(@Request() req: ExpressRequest) {
    return TransactionService.getZReport(req);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public async getById(
    @Request() req: ExpressRequest,
    @Path() id: string,
  ): Promise<any> {
    return TransactionService.getTransactionById(id, req);
  }
}
