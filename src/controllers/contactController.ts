import { Body, Delete, Get, Path, Post, Put, Route, Tags, Request } from "tsoa";
import { ContactService } from "../services/contactService";
import {
  CreateContactDto,
  IPaged,
  IResponse,
  ReplyToContactDto,
  TContact,
  TContactReply,
} from "../utils/interfaces/common";
import { NotificationHelper } from "../utils/notificationHelper";
import { Request as ExpressRequest } from "express";
import { Request as Req } from "express";

@Tags("Contact")
@Route("/api/contact")
export class ContactController {
  @Get("/")
  public async getContacts(
    @Request() req: ExpressRequest,
  ): Promise<IPaged<TContact[]>> {
    const { searchq, limit, page } = req.query;
    const currentPage = page ? parseInt(page as string) : undefined;
    return ContactService.getAllContact(
      searchq as string | undefined,
      limit ? parseInt(limit as string) : undefined,
      currentPage,
    );
  }

  @Get("/{id}")
  public async getContact(
    @Path() id: string,
  ): Promise<IResponse<TContact | null>> {
    return ContactService.getContact(id);
  }

  @Post("/")
  public async createContact(
    @Body() contactData: CreateContactDto,
    @Request() request: Req,
  ): Promise<IResponse<TContact>> {
    const result = await new ContactService(request).createContact(contactData);

    const io = request.app.get("io");
    if (io && result) {
      await NotificationHelper.sendToRole(
        io,
        "ADMIN",
        "New Contact Inquiry",
        `New contact from ${result.data.name}`,
        "info",
        `/dashboard/contacts/${result.data.id}`,
        "contact",
        result.data.id,
        {
          contactEmail: result.data.email,
          contactCompany: result.data.company,
        },
      );
    }

    return result;
  }

  @Post("/{contactId}/reply")
  public async replyToContact(
    @Path() contactId: string,
    @Body() data: ReplyToContactDto,
    @Request() request: Req,
  ): Promise<IResponse<TContactReply>> {
    const adminName =
      data.adminName ||
      `${request.user?.firstName} ${request.user?.lastName}`.trim() ||
      "Admin";

    return await ContactService.replyToContact(
      contactId,
      data.message,
      adminName,
    );
  }

  @Get("/{contactId}/replies")
  public async getContactReplies(
    @Path() contactId: string,
  ): Promise<IResponse<TContactReply[]>> {
    return await ContactService.getReplies(contactId);
  }

  @Put("/{id}")
  public async updateContact(
    @Path() id: string,
    @Body() contactData: CreateContactDto,
  ): Promise<IResponse<TContact | null>> {
    return ContactService.updateContact(id, contactData);
  }

  @Delete("/{id}")
  public async deleteContact(@Path() id: string): Promise<IResponse<null>> {
    return ContactService.deleteContact(id);
  }
}
