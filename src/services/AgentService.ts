import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import { CreateAgentDto, IResponse, TAgent } from "../utils/interfaces/common";
import AppError from "../utils/error";
import { hash } from "bcrypt";
import { roles } from "../utils/roles";

export class AgentService extends BaseService {
  public async createAgent(
    agentData: CreateAgentDto,
  ): Promise<IResponse<TAgent>> {
    try {
      const hashedPassword = await hash("Password123!", 10);

      const user = await prisma.user.create({
        data: {
          email: agentData.email,
          firstName: agentData.firstName,
          lastName: agentData.lastName,
          phoneNumber: agentData.phoneNumber,
          password: hashedPassword,
          photo:
            typeof agentData.photo === "string" ? agentData.photo : undefined,
        },
      });
      if (!user) {
        throw new Error("Failed to create user");
      }

      // Assign the "USER" role
      const assignRole = await prisma.userRole.create({
        data: {
          userId: user.id,
          name: roles.AGENT,
        },
      });

      if (!assignRole) {
        throw new Error("Failed to assign role to user");
      }

      const agent = await prisma.agents.create({
        data: {
          userId: user.id,
          experience: agentData.experience,
          speciality: agentData.speciality,
          whatsapp: agentData.whatsapp,
          joined: agentData.joined,
          languages: agentData.languages,
          about: agentData.about,
          description: agentData.description,
          agentReviews: {
            create: {
              count: 0,
              rating: 0,
            },
          },
        },
      });
      return {
        statusCode: 201,
        message: "Agent created successfully",
        data: agent,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getAgent(agentId: string): Promise<IResponse<TAgent>> {
    try {
      const agent = await prisma.agents.findUnique({
        where: {
          id: agentId,
        },
        include: {
          user: true,
          agentReviews: true,
          enquiryProperty: true,
        },
      });

      if (!agent) {
        throw new AppError("Agent post not found", 404);
      }
      return {
        statusCode: 200,
        message: "Agent post fetched successfully",
        data: agent,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getAllAgents(): Promise<IResponse<TAgent[]>> {
    try {
      const agents = await prisma.agents.findMany({
        include: {
          user: true,
          agentReviews: true,
          enquiryProperty: true,
        },
      });

      return {
        statusCode: 200,
        message: "agents fetched successfully",
        data: agents,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updateAgent(
    agentId: string,
    agentData: Partial<CreateAgentDto>,
  ): Promise<IResponse<TAgent>> {
    try {
      // Update the agent-specific fields
      const agent = await prisma.agents.update({
        where: { id: agentId },
        data: {
          experience: agentData.experience,
          speciality: agentData.speciality,
          whatsapp: agentData.whatsapp,
          joined: agentData.joined,
          languages: agentData.languages,
          about: agentData.about,
          description: agentData.description,
        },
      });

      // Update the user-specific fields
      await prisma.user.update({
        where: { id: agent.userId },
        data: {
          email: agentData.email,
          firstName: agentData.firstName,
          lastName: agentData.lastName,
          photo:
            typeof agentData.photo === "string" ? agentData.photo : undefined,
        },
      });

      return {
        statusCode: 200,
        message: "Agent post updated successfully",
        data: agent,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async deleteAgent(agentId: string): Promise<IResponse<null>> {
    try {
      await prisma.agents.delete({ where: { id: agentId } });
      return {
        statusCode: 200,
        message: "agent post deleted successfully",
        data: null,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
