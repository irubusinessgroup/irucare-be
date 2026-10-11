import {
  Body,
  Get,
  Middlewares,
  Patch,
  Path,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import { Request as ExpressRequest } from "express";
import {
  ActivationService,
  AdminUpdateActivationStatusDto,
  ReviewActivationDocumentDto,
} from "../services/ActivationService";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";

/** RRA EBM activation review (KYC is submitted with company registration). */
@Security("jwt")
@Route("/api/activation")
@Tags("Activation")
export class ActivationController {
  /** The signed-in user's company activation progress. */
  @Get("/me")
  public async myStatus(@Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      return {
        statusCode: 200,
        message: "No company context",
        data: { status: null, statusLabel: null, canSetupEbm: true },
      };
    }
    return ActivationService.getMyStatus(companyId);
  }

  @Get("/admin")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async list(@Query() status?: string, @Query() search?: string) {
    return ActivationService.list(status, search);
  }

  @Get("/admin/{id}")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async getById(@Path() id: string) {
    return ActivationService.getById(id);
  }

  @Patch("/admin/{id}/status")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async updateStatus(
    @Path() id: string,
    @Body() body: AdminUpdateActivationStatusDto,
    @Request() req: ExpressRequest,
  ) {
    return ActivationService.updateStatus(id, body, req.user?.id, req.app.get("io"));
  }

  @Patch("/admin/documents/{documentId}")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async reviewDocument(
    @Path() documentId: string,
    @Body() body: ReviewActivationDocumentDto,
  ) {
    return ActivationService.reviewDocument(documentId, body);
  }

  /** ZIP of all documents, named after the company (e.g. jamilo.zip) */
  @Get("/admin/{id}/zip")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async downloadZip(@Path() id: string, @Request() req: ExpressRequest): Promise<void> {
    await ActivationService.streamZip(id, req);
  }
}
