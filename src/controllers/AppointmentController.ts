import {
  Body,
  Delete,
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
import { AppointmentService } from "../services/AppointmentService";
import {
  AppointmentReminderService,
  ConfigureRemindersDto,
} from "../services/AppointmentReminderService";
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  AppointmentFilters,
  TAppointment,
  IResponse,
  IPaged,
  AvailableTimeSlot,
  AppointmentStatistics,
  RescheduleAppointmentDto,
  CancelAppointmentDto,
  CompleteAppointmentDto,
  NoShowAppointmentDto,
  AppointmentType,
  AppointmentStatus,
} from "../utils/interfaces/common";
import { Request as Req } from "express";
// import { checkRole } from "../middlewares/checkRole";
import { isACompanyMemberOrAdmin } from "../middlewares/isAcompanyMember";

@Tags("Appointment")
@Route("/api/appointments")
@Security("jwt")
@Middlewares(isACompanyMemberOrAdmin)
export class AppointmentController {
  @Get("/")
  public async getAllAppointments(
    @Request() request: Req,
    @Query() page?: number,
    @Query() limit?: number,
    @Query() searchq?: string,
    @Query() patientId?: string,
    @Query() providerId?: string,
    @Query() appointmentType?: AppointmentType,
    @Query() status?: AppointmentStatus,
    @Query() startDate?: string,
    @Query() endDate?: string,
  ): Promise<IPaged<TAppointment[]>> {
    const companyId = request.user?.company?.companyId;
    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    const filters: AppointmentFilters = {
      page,
      limit,
      searchq,
      patientId,
      providerId,
      appointmentType,
      status,
      startDate,
      endDate,
      companyId,
    };

    return AppointmentService.getAllAppointments(request, filters);
  }

  @Get("/{id}")
  public async getAppointmentById(
    @Path() id: string,
    @Request() request: Req,
  ): Promise<IResponse<TAppointment>> {
    return AppointmentService.getAppointmentById(id, request);
  }

  @Post("/")
  public async createAppointment(
    @Body() appointmentData: CreateAppointmentDto,
    @Request() request: Req,
  ): Promise<IResponse<TAppointment>> {
    return AppointmentService.createAppointment(appointmentData, request);
  }

  @Put("/{id}")
  public async updateAppointment(
    @Path() id: string,
    @Body() appointmentData: UpdateAppointmentDto,
    @Request() request: Req,
  ): Promise<IResponse<TAppointment>> {
    return AppointmentService.updateAppointment(id, appointmentData, request);
  }

  @Delete("/{id}")
  public async deleteAppointment(
    @Path() id: string,
    @Request() request: Req,
  ): Promise<IResponse<null>> {
    return AppointmentService.deleteAppointment(id, request);
  }

  @Put("/{id}/confirm")
  public async confirmAppointment(
    @Path() id: string,
    @Request() request: Req,
  ): Promise<IResponse<TAppointment>> {
    return AppointmentService.confirmAppointment(id, request);
  }

  @Put("/{id}/cancel")
  public async cancelAppointment(
    @Path() id: string,
    @Body() cancelData: CancelAppointmentDto,
    @Request() request: Req,
  ): Promise<IResponse<TAppointment>> {
    return AppointmentService.cancelAppointment(id, cancelData, request);
  }

  @Put("/{id}/reschedule")
  public async rescheduleAppointment(
    @Path() id: string,
    @Body() rescheduleData: RescheduleAppointmentDto,
    @Request() request: Req,
  ): Promise<IResponse<TAppointment>> {
    return AppointmentService.rescheduleAppointment(
      id,
      rescheduleData,
      request,
    );
  }

  @Put("/{id}/complete")
  public async completeAppointment(
    @Path() id: string,
    @Body() completeData: CompleteAppointmentDto,
    @Request() request: Req,
  ): Promise<IResponse<TAppointment>> {
    return AppointmentService.completeAppointment(id, completeData, request);
  }

  @Put("/{id}/no-show")
  public async markNoShow(
    @Path() id: string,
    @Body() noShowData: NoShowAppointmentDto,
    @Request() request: Req,
  ): Promise<IResponse<TAppointment>> {
    return AppointmentService.markNoShow(id, noShowData, request);
  }

  @Get("/available-slots")
  public async getAvailableTimeSlots(
    @Request() request: Req,
    @Query() providerId: string,
    @Query() date: string,
    @Query() duration?: number,
  ): Promise<IResponse<AvailableTimeSlot[]>> {
    return AppointmentService.getAvailableTimeSlots(
      providerId,
      date,
      duration || 30,
      request,
    );
  }

  @Get("/today")
  public async getTodayAppointments(
    @Request() request: Req,
    @Query() providerId?: string,
  ): Promise<IResponse<TAppointment[]>> {
    return AppointmentService.getTodayAppointments(request, providerId);
  }

  @Get("/upcoming")
  public async getUpcomingAppointments(
    @Request() request: Req,
    @Query() days?: number,
  ): Promise<IResponse<TAppointment[]>> {
    return AppointmentService.getUpcomingAppointments(request, days || 7);
  }

  @Get("/statistics")
  public async getAppointmentStatistics(
    @Request() request: Req,
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Query() providerId?: string,
    @Query() appointmentType?: AppointmentType,
  ): Promise<IResponse<AppointmentStatistics>> {
    return AppointmentService.getAppointmentStatistics(
      request,
      startDate,
      endDate,
      providerId,
      appointmentType,
    );
  }

  @Get("/patient/{patientId}")
  public async getPatientAppointments(
    @Path() patientId: string,
    @Request() request: Req,
    @Query() page?: number,
    @Query() limit?: number,
  ): Promise<IPaged<TAppointment[]>> {
    const companyId = request.user?.company?.companyId;
    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    const filters: AppointmentFilters = {
      page,
      limit,
      patientId,
      companyId,
    };

    return AppointmentService.getAllAppointments(request, filters);
  }

  @Get("/provider/{providerId}")
  public async getProviderAppointments(
    @Path() providerId: string,
    @Request() request: Req,
    @Query() page?: number,
    @Query() limit?: number,
  ): Promise<IPaged<TAppointment[]>> {
    const companyId = request.user?.company?.companyId;
    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    const filters: AppointmentFilters = {
      page,
      limit,
      providerId,
      companyId,
    };

    return AppointmentService.getAllAppointments(request, filters);
  }

  @Post("/{id}/reminders")
  public async configureReminders(
    @Path() id: string,
    @Body() body: ConfigureRemindersDto,
  ) {
    return AppointmentReminderService.configureReminders(id, body);
  }

  @Get("/{id}/reminders")
  public async getReminders(@Path() id: string) {
    return AppointmentReminderService.getReminders(id);
  }

  @Get("/reminders/pending")
  public async getPendingReminders(
    @Query() page?: number,
    @Query() limit?: number,
  ) {
    return AppointmentReminderService.getPendingReminders(page, limit);
  }
}
