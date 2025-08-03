import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import {
  CreateTestimonyDto,
  IResponse,
  TTestimony,
} from "../utils/interfaces/common";
import AppError from "../utils/error";

function calculateRating(totalCount: number, totalTestimonies: number): number {
  return totalCount / totalTestimonies;
}

export class TestimonyService extends BaseService {
  public async createPropertyTestimony(
    testimonyData: CreateTestimonyDto,
  ): Promise<IResponse<TTestimony>> {
    try {
      let newTestimony;
      if (testimonyData.userId) {
        const user = await prisma.user.findUnique({
          where: { id: testimonyData.userId },
          select: { firstName: true, lastName: true, photo: true },
        });
        if (user) {
          newTestimony = await prisma.testimony.create({
            data: {
              name: user.firstName + " " + user.lastName,
              message: testimonyData.message,
              rating: testimonyData.rating ?? null,
              reviewsId: testimonyData.reviewsId ?? undefined,
              photo:
                typeof testimonyData.photo === "string"
                  ? testimonyData.photo
                  : user.photo,
            },
          });
        }
      } else {
        newTestimony = await prisma.testimony.create({
          data: {
            name: testimonyData.name ?? null,
            message: testimonyData.message,
            rating: testimonyData.rating ?? null,
            reviewsId: testimonyData.reviewsId ?? undefined,
            photo:
              typeof testimonyData.photo === "string"
                ? testimonyData.photo
                : undefined,
          },
        });
      }

      // Count all testimonies where reviewsId matches
      const totalTestimonies = await prisma.testimony.count({
        where: { reviewsId: testimonyData.reviewsId! },
      });
      // Update the review where reviewsId matches by incrementing count
      const existingReview = await prisma.reviews.findUnique({
        where: { id: testimonyData.reviewsId! },
        select: { count: true },
      });

      const totalCount =
        (existingReview?.count ?? 0) + (testimonyData.rating ?? 0);

      await prisma.reviews.update({
        where: { id: testimonyData.reviewsId! },
        data: {
          count: totalCount,
          rating: calculateRating(totalCount, totalTestimonies),
        },
      });

      return {
        statusCode: 201,
        message: "Testimony created successfully",
        data: newTestimony,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public async createAgentTestimony(
    testimonyData: CreateTestimonyDto,
  ): Promise<IResponse<TTestimony>> {
    try {
      let newTestimony;
      if (testimonyData.userId) {
        const user = await prisma.user.findUnique({
          where: { id: testimonyData.userId },
          select: { firstName: true, lastName: true, photo: true },
        });
        if (user) {
          newTestimony = await prisma.testimony.create({
            data: {
              name: user.firstName + " " + user.lastName,
              message: testimonyData.message,
              rating: testimonyData.rating ?? null,
              agentReviewId: testimonyData.agentReviewId ?? undefined,
              photo:
                typeof testimonyData.photo === "string"
                  ? testimonyData.photo
                  : user.photo,
            },
          });
        }
      } else {
        newTestimony = await prisma.testimony.create({
          data: {
            name: testimonyData.name ?? null,
            message: testimonyData.message,
            rating: testimonyData.rating ?? null,
            agentReviewId: testimonyData.agentReviewId ?? undefined,
            photo:
              typeof testimonyData.photo === "string"
                ? testimonyData.photo
                : undefined,
          },
        });
      }
      // Count all testimonies where agentReviewId matches
      const totalTestimonies = await prisma.testimony.count({
        where: { agentReviewId: testimonyData.agentReviewId! },
      });

      // Update the review where agentReviewId matches by incrementing count
      const existingReview = await prisma.agentReview.findUnique({
        where: { id: testimonyData.agentReviewId! },
        select: { count: true },
      });

      const totalCount =
        (existingReview?.count ?? 0) + (testimonyData.rating ?? 0);
      await prisma.agentReview.update({
        where: { id: testimonyData.agentReviewId! },
        data: {
          count: totalCount,
          rating: calculateRating(totalCount, totalTestimonies),
        },
      });

      return {
        statusCode: 201,
        message: "Testimony created successfully",
        data: newTestimony,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getTestimony(
    testimonyId: string,
  ): Promise<IResponse<TTestimony>> {
    try {
      const testimony = await prisma.testimony.findUnique({
        where: {
          id: testimonyId,
        },
        include: {
          user: true,
          agentReviews: true,
          reviews: true,
        },
      });

      if (!testimony) {
        throw new AppError("testimony post not found", 404);
      }
      return {
        statusCode: 200,
        message: "testimony post fetched successfully",
        data: testimony,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getAllTestimony(): Promise<IResponse<TTestimony[]>> {
    try {
      const testimony = await prisma.testimony.findMany({
        include: {
          user: true,
          agentReviews: true,
          reviews: true,
        },
      });

      return {
        statusCode: 200,
        message: "testimony fetched successfully",
        data: testimony,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updateTestimony(
    testimonyId: string,
    testimonyData: Partial<CreateTestimonyDto>,
  ): Promise<IResponse<TTestimony>> {
    try {
      const updatedTestimony = await prisma.testimony.update({
        where: { id: testimonyId },
        data: {
          ...testimonyData,
          photo:
            typeof testimonyData.photo === "string"
              ? testimonyData.photo
              : undefined,
        },
      });
      return {
        statusCode: 200,
        message: "Testimony post updated successfully",
        data: updatedTestimony,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async deleteTestimony(
    testimonyId: string,
  ): Promise<IResponse<null>> {
    try {
      await prisma.testimony.delete({ where: { id: testimonyId } });
      return {
        statusCode: 200,
        message: "testimony post deleted successfully",
        data: null,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
