import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Request,
  Route,
  Security,
  Tags,
  Path,
} from "tsoa";
import type { Request as ExpressRequest } from "express";
import {
  ReferralService,
  CreateReferralDto,
  UpdateReferralDto,
} from "../services/ReferralService";

@Tags("Referrals")
@Route("api/referrals")
@Security("jwt")
export class ReferralController extends Controller {
  @Get("/")
  public list(@Request() req: ExpressRequest) {
    const {
      page,
      limit,
      patientId,
      encounterId,
      referringProviderId,
      referredToProviderId,
      status,
    } = req.query;
    return ReferralService.list(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
      {
        patientId: patientId as string | undefined,
        encounterId: encounterId as string | undefined,
        referringProviderId: referringProviderId as string | undefined,
        referredToProviderId: referredToProviderId as string | undefined,
        status: status as string | undefined,
      }
    );
  }

  @Get("/{id}")
  public get(@Path() id: string) {
    return ReferralService.getById(id);
  }

  @Post("/")
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateReferralDto
  ) {
    return ReferralService.create(req, body);
  }

  @Put("/{id}")
  public update(@Path() id: string, @Body() body: UpdateReferralDto) {
    return ReferralService.update(id, body);
  }

  @Delete("/{id}")
  public remove(@Path() id: string) {
    return ReferralService.remove(id);
  }

  @Post("/{id}/accept")
  public accept(
    @Path() id: string,
    @Request() req: ExpressRequest,
    @Body() body?: { appointmentDate?: string }
  ) {
    return ReferralService.accept(req, id, body?.appointmentDate);
  }

  @Post("/{id}/complete")
  public complete(
    @Path() id: string,
    @Request() req: ExpressRequest,
    @Body() body?: { responseNotes?: string; followUpEncounterId?: string }
  ) {
    return ReferralService.complete(
      req,
      id,
      body?.responseNotes,
      body?.followUpEncounterId
    );
  }
}
