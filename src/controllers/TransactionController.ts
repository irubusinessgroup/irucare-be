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
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public async getAll(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number
  ): Promise<any> {
    return TransactionService.getAllTransactions(req, searchq, limit, page);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public async getById(
    @Request() req: ExpressRequest,
    @Path() id: string
  ): Promise<any> {
    return TransactionService.getTransactionById(id, req);
  }
}
