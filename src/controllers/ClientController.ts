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
import { ClientService } from "../services/ClientService";
import { CreateClientDto, UpdateClientDto } from "../utils/interfaces/common";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Security("jwt")
@Route("/api/clients")
@Tags("Client")
export class ClientController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getAllClients(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    return ClientService.getAllClients(req, searchq, limit, page);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getClientById(@Path() id: string, @Request() req: ExpressRequest) {
    return ClientService.getClientById(id, req);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createClient(
    @Body() body: CreateClientDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    return ClientService.createClient(body, companyId!);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateClient(
    @Path() id: string,
    @Body() body: UpdateClientDto,
    @Request() req: ExpressRequest,
  ) {
    return ClientService.updateClient(id, body, req);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public deleteClient(@Path() id: string, @Request() req: ExpressRequest) {
    return ClientService.deleteClient(id, req);
  }
}
