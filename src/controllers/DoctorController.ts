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
import { DoctorService } from "../services/DoctorService";
import { CreateDoctorDto, UpdateDoctorDto } from "../utils/interfaces/common";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Security("jwt")
@Route("/api/doctors")
@Tags("Doctor")
export class DoctorController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getAllDoctors(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number
  ) {
    return DoctorService.getAllDoctors(req, searchq, limit, page);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getDoctorById(@Path() id: string) {
    return DoctorService.getDoctorById(id);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createDoctor(@Body() body: CreateDoctorDto) {
    return DoctorService.createDoctor(body);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateDoctor(@Path() id: string, @Body() body: UpdateDoctorDto) {
    return DoctorService.updateDoctor(id, body);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public deleteDoctor(@Path() id: string) {
    return DoctorService.deleteDoctor(id);
  }
}
