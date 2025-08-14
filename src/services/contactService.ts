import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import {
  CreateContactDto,
  IPaged,
  IResponse,
  TContact,
} from "../utils/interfaces/common";
import AppError from "../utils/error";
import { sendEmail } from "../utils/email";
import { Paginations, QueryOptions } from "../utils/DBHelpers";

export class ContactService extends BaseService {
  public async createContact(data: CreateContactDto) {
    try {
      const existingContact = await prisma.contact.findFirst({
        where: { email: data.email },
        orderBy: { createdAt: "desc" },
      });

      let conversationId = existingContact?.conversationId;

      if (!conversationId) {
        conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      const contact = await prisma.contact.create({
        data: {
          ...data,
          conversationId,
          status: "PENDING",
        },
      });

      await sendEmail({
        to: contact.email,
        subject: "Thank you for contacting IRUCARE",
        body: `Dear ${contact.name},\n\nWe’ve received your message and will get back to you shortly.\n\nThanks,\n\nBest regards,\nThe IRUCARE Team`,
      });
      return {
        statusCode: 201,
        message: "Contact created successfully",
        data: contact,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async replyToContact(
    contactId: string,
    message: string,
    adminName: string,
  ) {
    try {
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
      });

      if (!contact) {
        throw new AppError("Contact not found", 404);
      }

      const reply = await prisma.contactReply.create({
        data: {
          contactId,
          message,
          adminName,
        },
      });

      try {
        await sendEmail({
          to: contact.email,
          subject: `Re: Your inquiry to IRUCARE`,
          body:
            `Dear ${contact.name},\n\n` +
            `Thank you for contacting us. Here's our reply to your inquiry:\n\n` +
            `---\n${message}\n---\n\n` +
            `If you have any further questions, please don't hesitate to contact us.\n\n` +
            `Best regards,\n${adminName}\nIRUCARE Team`,
        });
      } catch (emailError) {
        console.error("Failed to send email reply:", emailError);
      }

      return {
        statusCode: 201,
        message: "Reply sent successfully",
        data: reply,
      };
    } catch (error) {
      throw new AppError("Failed to send reply", 500);
    }
  }

  public static async getReplies(contactId: string) {
    const replies = await prisma.contactReply.findMany({
      where: { contactId },
      orderBy: { createdAt: "asc" },
    });
    return {
      statusCode: 200,
      message: "Replies fetched successfully",
      data: replies,
    };
  }

  public static async getContact(id: string): Promise<IResponse<TContact>> {
    try {
      const contact = await prisma.contact.findUnique({
        where: { id },
        include: {
          replies: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!contact) throw new AppError("Contact not found", 404);
      return {
        statusCode: 200,
        message: "contact fetched successfully",
        data: contact,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getAllContact(
    searchq?: string,
    limit?: number,
    currentPage?: number,
  ): Promise<IPaged<TContact[]>> {
    try {
      const queryOptions = QueryOptions(["name", "email", "company"], searchq);

      const pagination = Paginations(currentPage, limit);
      const contacts = await prisma.contact.findMany({
        where: queryOptions,
        ...pagination,
        orderBy: {
          createdAt: "desc",
        },
        include: { replies: { orderBy: { createdAt: "asc" } } },
      });

      const totalItems = await prisma.contact.count({
        where: queryOptions,
      });

      return {
        statusCode: 200,
        message: "contact fetched successfully",
        data: contacts,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 15,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updateContact(
    contactId: string,
    contactData: CreateContactDto,
  ): Promise<IResponse<TContact>> {
    try {
      const updatedContact = await prisma.contact.update({
        where: { id: contactId },
        data: {
          ...contactData,
        },
      });
      return {
        statusCode: 200,
        message: "contact updated successfully",
        data: updatedContact,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async deleteContact(
    contactId: string,
  ): Promise<IResponse<null>> {
    try {
      await prisma.contact.delete({ where: { id: contactId } });
      return {
        statusCode: 200,
        message: "contact  deleted successfully",
        data: null,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
