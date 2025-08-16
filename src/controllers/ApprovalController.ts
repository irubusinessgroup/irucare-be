import {
  Body,
  Get,
  Middlewares,
  Path,
  Post,
  Put,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import { ApprovalService } from "../services/ApprovalService";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";
import {
  CreateApprovalDto,
  UpdateApprovalDto,
} from "../utils/interfaces/common";

@Security("jwt")
@Route("/api/approvals")
@Tags("Approvals")
export class ApprovalController {
  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateApproval(
    @Path() id: string,
    @Body() body: UpdateApprovalDto,
    @Request() req: ExpressRequest,
  ) {
    return ApprovalService.updateApproval(id, body, req);
  }

  @Get("/stock-receipt/{stockReceiptId}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getApprovalByStockReceiptId(@Path() stockReceiptId: string) {
    return ApprovalService.getApprovalByStockReceiptId(stockReceiptId);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createApproval(
    @Body() body: CreateApprovalDto,
    @Request() req: ExpressRequest,
  ) {
    return ApprovalService.createApproval(body, req);
  }
}
