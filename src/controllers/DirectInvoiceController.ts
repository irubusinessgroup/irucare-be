import {
  Body,
  Get,
  Post,
  Put,
  Delete,
  Route,
  Tags,
  Path,
  Security,
  Request,
  Query,
  Middlewares,
} from "tsoa";
import { DirectInvoiceService } from "../services/DirectInvoiceService";
import {
  CreateDirectInvoiceDto,
  UpdateDirectInvoiceDto,
  DirectInvoiceResponse,
  IPaged,
  IResponse,
} from "../utils/interfaces/common";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Security("jwt")
@Route("/api/direct-invoices")
@Tags("Direct Invoice")
export class DirectInvoiceController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getAllDirectInvoices(
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number,
    @Query() searchq?: string,
    @Query() status?: string,
    @Query() clientId?: string,
  ): Promise<IPaged<DirectInvoiceResponse[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    return DirectInvoiceService.getAllDirectInvoices({
      page: page || 1,
      limit: limit || 15,
      searchq,
      status,
      clientId,
      companyId,
    });
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getDirectInvoiceById(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<DirectInvoiceResponse>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    return DirectInvoiceService.getDirectInvoiceById(id, companyId);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createDirectInvoice(
    @Body() data: CreateDirectInvoiceDto,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<DirectInvoiceResponse>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    return DirectInvoiceService.createDirectInvoice(data, companyId);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateDirectInvoice(
    @Path() id: string,
    @Body() data: UpdateDirectInvoiceDto,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<DirectInvoiceResponse>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    return DirectInvoiceService.updateDirectInvoice(id, data, companyId);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public deleteDirectInvoice(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    return DirectInvoiceService.deleteDirectInvoice(id, companyId);
  }

  @Put("/{id}/send")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public sendDirectInvoice(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    return DirectInvoiceService.sendDirectInvoice(id, companyId);
  }

  @Put("/{id}/mark-paid")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public markDirectInvoiceAsPaid(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    return DirectInvoiceService.markDirectInvoiceAsPaid(id, companyId);
  }

  @Put("/{id}/cancel")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public cancelDirectInvoice(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    return DirectInvoiceService.cancelDirectInvoice(id, companyId);
  }

  @Get("/generate-number")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public generateInvoiceNumber(
    @Request() req: ExpressRequest,
  ): Promise<IResponse<{ invoiceNumber: string }>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    return DirectInvoiceService.generateInvoiceNumber(companyId).then(
      (invoiceNumber) => ({
        statusCode: 200,
        message: "Invoice number generated successfully",
        data: { invoiceNumber },
      }),
    );
  }
}
