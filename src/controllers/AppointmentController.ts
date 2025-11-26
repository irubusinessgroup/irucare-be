import {
  Body,
  // Delete,
  Get,
  Path,
  Post,
  Put,
  Route,
  Tags,
  Request,
  Middlewares,
  Security,
  Query,
} from "tsoa";
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from "../utils/interfaces/common";
import { AppointmentService } from "../services/AppointmentService";
import { Request as Req } from "express";
import { isACompanyMemberOrAdmin } from "../middlewares/isAcompanyMember";

@Tags("Appointments")
@Route("/api/appointments")
@Security("jwt")
@Middlewares(isACompanyMemberOrAdmin)
export class AppointmentController {
  @Post("/")
  public async createAppointment(
    @Body() data: CreateAppointmentDto,
    @Request() request: Req,
  ) {
    return AppointmentService.createAppointment(data, request);
  }

  @Post("/walk-in")
  public async registerWalkIn(
    @Body() data: CreateAppointmentDto,
    @Request() request: Req,
  ) {
    return AppointmentService.registerWalkIn(data, request);
  }

  @Get("/calendar/day")
  public async getDayView(
    @Query() date: string,
    @Query() providerId?: string,
    @Query() room?: string,
    @Request() request?: Req,
  ) {
    return AppointmentService.getDayView(date, providerId, room, request!);
  }

  @Get("/calendar/week")
  public async getWeekView(
    @Query() startDate: string,
    @Query() providerId?: string,
    @Query() room?: string,
    @Request() request?: Req,
  ) {
    return AppointmentService.getWeekView(
      startDate,
      providerId,
      room,
      request!,
    );
  }

  @Get("/calendar/month")
  public async getMonthView(
    @Query() year: number,
    @Query() month: number,
    @Query() providerId?: string,
    @Request() request?: Req,
  ) {
    return AppointmentService.getMonthView(year, month, providerId, request!);
  }

  @Get("/queue/waiting-room")
  public async getWaitingRoom(@Request() request: Req) {
    return AppointmentService.getWaitingRoom(request);
  }

  @Put("/{id}/check-in")
  public async checkInPatient(@Path() id: string, @Request() request: Req) {
    return AppointmentService.checkInPatient(id, request);
  }

  @Post("/queue/call-next")
  public async callNextPatient(
    @Query() providerId: string,
    @Request() request: Req,
  ) {
    return AppointmentService.callNextPatient(providerId, request);
  }

  @Put("/{id}/transfer")
  public async transferPatient(
    @Path() id: string,
    @Body() body: { transferTo: string },
    @Request() request: Req,
  ) {
    return AppointmentService.transferPatient(id, body.transferTo, request);
  }

  @Get("/today")
  public async getTodayAppointments(
    @Query() providerId?: string,
    @Request() request?: Req,
  ) {
    return AppointmentService.getTodayAppointments(providerId, request!);
  }

  @Get("/upcoming")
  public async getUpcomingAppointments(
    @Query() days?: number,
    @Query() providerId?: string,
    @Request() request?: Req,
  ) {
    return AppointmentService.getUpcomingAppointments(
      days || 7,
      providerId,
      request!,
    );
  }

  @Get("/missed")
  public async getMissedAppointments(
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Request() request?: Req,
  ) {
    return AppointmentService.getMissedAppointments(
      startDate,
      endDate,
      request!,
    );
  }

  @Get("/")
  public async getAllAppointments(
    @Query() searchq?: string,
    @Query() page?: number,
    @Query() limit?: number,
    @Query() status?: string,
    @Query() providerId?: string,
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Request() request?: Req,
  ) {
    return AppointmentService.getAllAppointments(
      request!,
      searchq,
      limit,
      page,
      status,
      providerId,
      startDate,
      endDate,
    );
  }

  @Get("/available-slots")
  public async getAvailableSlots(
    @Query() providerId: string,
    @Query() date: string,
    @Query() duration?: number,
    @Request() request?: Req,
  ) {
    return AppointmentService.getAvailableSlots(
      providerId,
      date,
      duration || 30,
      request!,
    );
  }

  @Get("/{id}")
  public async getAppointmentById(@Path() id: string, @Request() request: Req) {
    return AppointmentService.getAppointmentById(id, request);
  }

  @Put("/{id}")
  public async updateAppointment(
    @Path() id: string,
    @Body() data: UpdateAppointmentDto,
    @Request() request: Req,
  ) {
    return AppointmentService.updateAppointment(id, data, request);
  }

  @Put("/{id}/cancel")
  public async cancelAppointment(
    @Path() id: string,
    @Body() body: { reason: string },
    @Request() request: Req,
  ) {
    return AppointmentService.cancelAppointment(id, body.reason, request);
  }

  @Put("/{id}/no-show")
  public async markNoShow(@Path() id: string, @Request() request: Req) {
    return AppointmentService.markNoShow(id, request);
  }

  @Put("/{id}/complete")
  public async completeAppointment(
    @Path() id: string,
    @Body() body: { encounterId?: string },
    @Request() request: Req,
  ) {
    return AppointmentService.completeAppointment(
      id,
      body.encounterId,
      request,
    );
  }

  @Get("/patient/{patientId}")
  public async getPatientAppointments(
    @Path() patientId: string,
    @Request() request: Req,
  ) {
    const appointments = await AppointmentService.getTodayAppointments(
      undefined,
      request,
    );
    return {
      ...appointments,
      data: appointments.data.filter((apt) => apt.patientId === patientId),
    };
  }

  @Get("/provider/{providerId}")
  public async getProviderAppointments(
    @Path() providerId: string,
    @Request() request: Req,
  ) {
    return AppointmentService.getTodayAppointments(providerId, request);
  }
}
