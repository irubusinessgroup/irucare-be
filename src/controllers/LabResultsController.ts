import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  Route,
  Security,
  Tags,
  Path,
} from "tsoa";
import type { Request as ExpressRequest } from "express";
import { LabResultsService } from "../services/LabResultsService";
import type { LabResultItem } from "../utils/interfaces/common";

@Tags("Lab Results")
@Route("api/lab-orders")
@Security("jwt")
export class LabResultsController extends Controller {
  @Post("/{id}/results")
  public addResults(
    @Path() id: string,
    @Body() body: { results: LabResultItem[] }
  ) {
    return LabResultsService.addResults(id, body.results);
  }

  @Get("/{id}/results")
  public getResults(@Path() id: string) {
    return LabResultsService.getResults(id);
  }

  @Get("/patient/{patientId}/results")
  public getPatientResults(
    @Path() patientId: string,
    @Request() req: ExpressRequest
  ) {
    const { page, limit, testName, startDate, endDate } = req.query;
    return LabResultsService.getPatientResults(
      patientId,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
      {
        testName: testName as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
      }
    );
  }

  @Get("/results/compare")
  public compareResults(@Request() req: ExpressRequest) {
    const { patientId, testCode, startDate, endDate } = req.query;
    if (!patientId || !testCode) {
      throw new Error("patientId and testCode are required");
    }
    return LabResultsService.compareResults(
      patientId as string,
      testCode as string,
      startDate as string | undefined,
      endDate as string | undefined
    );
  }

  @Get("/result-templates")
  public getResultTemplates() {
    return LabResultsService.getResultTemplates();
  }
}
