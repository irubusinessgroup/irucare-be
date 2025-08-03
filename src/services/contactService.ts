import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import {
  CreateContactDto,
  IResponse,
  TContact,
} from "../utils/interfaces/common";
import AppError from "../utils/error";
import { sendEmail } from "../utils/email";

export class ContactService extends BaseService {
  public async createContact(
    contactData: CreateContactDto,
  ): Promise<IResponse<TContact>> {
    try {
      let newContact;
      if (contactData.agentId) {
        const user = await prisma.agents.findUnique({
          where: { id: contactData.agentId },
          select: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        });
        const enquiryProperty = await prisma.enquiryProperty.create({
          data: {
            agentId: contactData.agentId!,
          },
        });
        newContact = await prisma.contact.create({
          data: {
            enquiryPropertyId: enquiryProperty.id ?? undefined,
            email: contactData.email,
            message: contactData.message,
            name: contactData.name,
            location: contactData.location || undefined,
            phoneNumber: contactData.phoneNumber || undefined,
            photo:
              typeof contactData.photo === "string"
                ? contactData.photo
                : undefined,
          },
        });
        await sendEmail({
          to: user!.user.email,
          subject: "New Enquiry Property Notification",
          body: `
            Dear ${user?.user.firstName} ${user?.user.lastName || "Agent"},

            You have a new enquiry property from ${contactData.name}.
            
            Details:
            - Email: ${contactData.email}
            - Phone Number: ${contactData.phoneNumber || "N/A"}
            - Location: ${contactData.location || "N/A"}
            - Message: ${contactData.message}

            Please follow up with the client as soon as possible.

            Best regards,
            KIGALI HOT MARKET Support Team
          `,
        });
      } else if (contactData.userId) {
        const user = await prisma.user.findUnique({
          where: { id: contactData.userId },
        });
        newContact = await prisma.contact.create({
          data: {
            email: user!.email,
            message: contactData.message,
            name: user!.firstName + "" + user!.lastName,
            location: contactData.location || undefined,
            phoneNumber: contactData.phoneNumber || undefined,
            photo:
              typeof contactData.photo === "string"
                ? contactData.photo
                : undefined,
          },
        });
      } else {
        newContact = await prisma.contact.create({
          data: {
            email: contactData.email,
            message: contactData.message,
            name: contactData.name,
            location: contactData.location || undefined,
            phoneNumber: contactData.phoneNumber || undefined,
            photo:
              typeof contactData.photo === "string"
                ? contactData.photo
                : undefined,
          },
        });
      }
      return {
        statusCode: 201,
        message: "newContact created successfully",
        data: newContact,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getContact(
    contactId: string,
  ): Promise<IResponse<TContact>> {
    try {
      const contact = await prisma.contact.findUnique({
        where: {
          id: contactId,
        },
        include: {
          enquiryProperty: true,
        },
      });

      if (!contact) {
        throw new AppError("contact post not found", 404);
      }
      return {
        statusCode: 200,
        message: "contact post fetched successfully",
        data: contact,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getAllContact(): Promise<IResponse<TContact[]>> {
    try {
      const contact = await prisma.contact.findMany({
        include: {
          enquiryProperty: true,
        },
      });

      return {
        statusCode: 200,
        message: "contact fetched successfully",
        data: contact,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updateContact(
    contactId: string,
    contactData: Partial<CreateContactDto>,
  ): Promise<IResponse<TContact>> {
    try {
      const updatedContact = await prisma.contact.update({
        where: { id: contactId },
        data: {
          ...contactData,
          photo:
            typeof contactData.photo === "string"
              ? contactData.photo
              : undefined,
        },
      });
      return {
        statusCode: 200,
        message: "contact post updated successfully",
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
        message: "contact post deleted successfully",
        data: null,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
