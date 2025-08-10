import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import {
  CreateContactDto,
  IPaged,
  IResponse,
  TContact,
  TContactReply,
  TConversation,
  TConversationMessage,
} from "../utils/interfaces/common";
import AppError from "../utils/error";
import { sendEmail } from "../utils/email";
import { Paginations, QueryOptions } from "../utils/DBHelpers";
import { time } from "console";

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
    adminName: string
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

  public static async getConversationMessages(
    email: string
  ): Promise<IResponse<TConversationMessage[]>> {
    try {
      const contacts = await prisma.contact.findMany({
        where: { email },
        include: { replies: { orderBy: { createdAt: "asc" } } },
      });

      if (contacts.length === 0) {
        throw new AppError("Conversation not found", 404);
      }

      const messages: TConversationMessage[] = [];

      contacts.forEach((contact) => {
        messages.push({
          id: contact.id,
          message: contact.message,
          senderType: "customer",
          senderName: contact.name,
          senderEmail: contact.email,
          createdAt: contact.createdAt,
          contactId: contact.id,
        });

        contact.replies.forEach((reply) => {
          messages.push({
            id: reply.id,
            message: reply.message,
            senderType: "admin",
            senderName: reply.adminName || "Admin",
            adminName: reply.adminName,
            createdAt: reply.createdAt,
            contactId: contact.id,
          });
        });
      });

      messages.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      return {
        statusCode: 200,
        message: "Conversation messages fetched successfully",
        data: messages,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getConversationByEmail(
    email: string
  ): Promise<IResponse<TConversation>> {
    try {
      const contacts = await prisma.contact.findMany({
        where: { email },
        include: { replies: { orderBy: { createdAt: "asc" } } },
      });

      if (contacts.length === 0) {
        throw new AppError("Conversation not found", 404);
      }

      const latestContact = contacts[0];
      const totalReplies = contacts.reduce(
        (sum, contact) => sum + contact.replies.length,
        0
      );

      let lastMessageAt = latestContact.createdAt;
      contacts.forEach((contact) => {
        if (contact.replies.length > 0) {
          const lastReply = contact.replies[contact.replies.length - 1];
          if (lastReply.createdAt > lastMessageAt) {
            lastMessageAt = lastReply.createdAt;
          }
        }
      });

      const allReplies = contacts.flatMap((contact) => contact.replies);

      const conversation: TConversation = {
        id: latestContact.conversationId || latestContact.id,
        email: latestContact.email,
        customerName: latestContact.name,
        company: latestContact.company,
        status: latestContact.status,
        lastMessageAt,
        totalMessages: contacts.length,
        totalReplies,
        contacts,
        replies: allReplies,
        createdAt: contacts[contacts.length - 1].createdAt,
        updatedAt: lastMessageAt,
      };

      return {
        statusCode: 200,
        message: "Conversation fetched successfully",
        data: conversation,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getAllConversations(
    searchq?: string,
    limit?: number,
    currentPage?: number
  ): Promise<IPaged<TConversation[]>> {
    try {
      const uniqueEmails = await prisma.contact.groupBy({
        by: ["email"],
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: "desc" } },
      });

      const pagination = Paginations(currentPage, limit);
      const skip = pagination.skip || 0;
      const take = pagination.take || 15;

      let filteredEmails = uniqueEmails;
      if (searchq) {
        const searchTerms = await prisma.contact.findMany({
          where: {
            OR: [
              { name: { contains: searchq, mode: "insensitive" } },
              { email: { contains: searchq, mode: "insensitive" } },
              { company: { contains: searchq, mode: "insensitive" } },
            ],
          },
          select: { email: true },
          distinct: ["email"],
        });

        const searchEmails = searchTerms.map((c) => c.email);
        filteredEmails = uniqueEmails.filter((item) =>
          searchEmails.includes(item.email)
        );
      }

      const paginatedEmails = filteredEmails.slice(skip, skip + take);

      const conversations: TConversation[] = [];

      for (const emailGroup of paginatedEmails) {
        const conversationResult = await this.getConversationByEmail(
          emailGroup.email
        );
        if (conversationResult.data) {
          conversations.push(conversationResult.data);
        }
      }

      return {
        statusCode: 200,
        message: "Conversations fetched successfully",
        data: conversations,
        totalItems: filteredEmails.length,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 15,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async replyToConversation(
    email: string,
    message: string,
    adminName: string
  ): Promise<IResponse<TContactReply>> {
    try {
      const latestContact = await prisma.contact.findFirst({
        where: { email },
        orderBy: { createdAt: "desc" },
      });

      if (!latestContact) {
        throw new AppError("Contact not found for this email", 404);
      }

      return await this.replyToContact(latestContact.id, message, adminName);
    } catch (error) {
      throw new AppError("Failed to reply to conversation", 500);
    }
  }

  public static async updateConversationStatus(
    email: string,
    status: "PENDING" | "RESOLVED"
  ) {
    try {
      await prisma.contact.updateMany({
        where: { email },
        data: { status },
      });

      return await this.getConversationByEmail(email);
    } catch (error) {
      throw new AppError("Failed to update conversation status", 500);
    }
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
    currentPage?: number
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
    contactData: CreateContactDto
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
    contactId: string
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
