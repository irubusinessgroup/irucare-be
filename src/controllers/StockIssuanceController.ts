import {
  Body,
  Get,
  Path,
  Post,
  Put,
  Delete,
  Request,
  Route,
  Security,
  Tags,
  Query,
  Middlewares,
} from "tsoa";
import { Request as ExpressRequest } from "express";
import { StockIssuanceService } from "../services/StockIssuanceService";
import { ReorderAlertsService } from "../services/ReorderAlertsService";
import { checkClinicRole, checkRoleAuto } from "../middlewares";
import { ClinicRole, roles } from "../utils/roles";

// ============= Stock Issuance Controller =============
@Tags("Stock Issuance")
@Route("/api/stock/issuance")
@Security("jwt")
export class StockIssuanceController {
  /**
   * Issue stock to department/ward/pharmacy
   */
  @Post("/issue")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PHARMACIST))
  public async issueStock(
    @Body()
    data: {
      itemId: string;
      quantity: number;
      issuedTo: string;
      issuedToType: "PHARMACY" | "WARD" | "DEPARTMENT" | "OTHER";
      recipientName: string;
      recipientId?: string;
      purpose: string;
      notes?: string;
      warehouseId: string;
      requestedBy?: string;
    },
    @Request() req: ExpressRequest
  ) {
    return StockIssuanceService.issueStock(req, data);
  }

  /**
   * Get issuance history
   */
  @Get("/history")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.PHARMACIST,
      ClinicRole.CLINIC_ADMIN
    )
  )
  public async getIssuanceHistory(
    @Request() req: ExpressRequest,
    @Query() itemId?: string,
    @Query() warehouseId?: string,
    @Query() issuedToType?: string,
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Query() limit?: number,
    @Query() page?: number
  ) {
    const filters = {
      itemId,
      warehouseId,
      issuedToType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    return StockIssuanceService.getIssuanceHistory(req, filters, limit, page);
  }
}

// ============= Stock Transfer Controller =============
@Tags("Stock Transfer")
@Route("/api/stock/transfer")
@Security("jwt")
export class StockTransferController {
  /**
   * Transfer stock between warehouses
   */
  @Post("/")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PHARMACIST))
  public async transferStock(
    @Body()
    data: {
      itemId: string;
      quantity: number;
      fromWarehouseId: string;
      toWarehouseId: string;
      reason: string;
      notes?: string;
      requestedBy?: string;
    },
    @Request() req: ExpressRequest
  ) {
    return StockIssuanceService.transferStock(req, data);
  }

  /**
   * Get stock movements (all types)
   */
  @Get("/movements")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.PHARMACIST,
      ClinicRole.CLINIC_ADMIN
    )
  )
  public async getStockMovements(
    @Request() req: ExpressRequest,
    @Query() itemId?: string,
    @Query() warehouseId?: string,
    @Query() movementType?: string,
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Query() limit?: number,
    @Query() page?: number
  ) {
    const filters = {
      itemId,
      warehouseId,
      movementType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    return StockIssuanceService.getStockMovements(req, filters, limit, page);
  }
}

// ============= Stock Adjustment Controller =============
@Tags("Stock Adjustment")
@Route("/api/stock/adjustment")
@Security("jwt")
export class StockAdjustmentController {
  /**
   * Adjust stock (add, subtract, or set)
   */
  @Post("/")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PHARMACIST))
  public async adjustStock(
    @Body()
    data: {
      itemId: string;
      warehouseId: string;
      adjustmentType: "ADD" | "SUBTRACT" | "SET";
      quantity: number;
      reason: string;
      notes?: string;
    },
    @Request() req: ExpressRequest
  ) {
    return StockIssuanceService.adjustStock(req, data);
  }
}

// ============= Reorder Rules Controller =============
@Tags("Reorder & Alerts")
@Route("/api/inventory/reorder")
@Security("jwt")
export class ReorderController {
  /**
   * Create or update reorder rule
   */
  @Post("/rules")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PHARMACIST))
  public async createReorderRule(
    @Body()
    data: {
      itemId: string;
      warehouseId?: string;
      minLevel: number;
      maxLevel: number;
      reorderPoint: number;
      reorderQuantity: number;
      autoReorder?: boolean;
      preferredSupplierId?: string;
      leadTimeDays?: number;
      notes?: string;
    },
    @Request() req: ExpressRequest
  ) {
    return ReorderAlertsService.createReorderRule(req, data);
  }

  /**
   * Get all reorder rules
   */
  @Get("/rules")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PHARMACIST))
  public async getReorderRules(
    @Request() req: ExpressRequest,
    @Query() itemId?: string,
    @Query() warehouseId?: string,
    @Query() belowReorderPoint?: boolean,
    @Query() limit?: number,
    @Query() page?: number
  ) {
    const filters = { itemId, warehouseId, belowReorderPoint };
    return ReorderAlertsService.getReorderRules(req, filters, limit, page);
  }

  /**
   * Delete reorder rule
   */
  @Delete("/rules/{ruleId}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PHARMACIST))
  public async deleteReorderRule(
    @Path() ruleId: string,
    @Request() req: ExpressRequest
  ) {
    return ReorderAlertsService.deleteReorderRule(req, ruleId);
  }

  /**
   * Manually check stock levels and generate alerts
   */
  @Post("/check-levels")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PHARMACIST))
  public async checkStockLevels(@Request() req: ExpressRequest) {
    // Note: In production, you'd pass io (Socket.IO) instance here
    return ReorderAlertsService.checkStockLevels(req);
  }
}

// ============= Stock Alerts Controller =============
@Tags("Stock Alerts")
@Route("/api/inventory/alerts")
@Security("jwt")
export class AlertsController {
  /**
   * Get active alerts
   */
  @Get("/")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PHARMACIST))
  public async getActiveAlerts(
    @Request() req: ExpressRequest,
    @Query() alertType?: string,
    @Query() severity?: string,
    @Query() itemId?: string,
    @Query() limit?: number,
    @Query() page?: number
  ) {
    const filters = { alertType, severity, itemId };
    return ReorderAlertsService.getActiveAlerts(req, filters, limit, page);
  }

  /**
   * Dismiss/acknowledge an alert
   */
  @Put("/{alertId}/dismiss")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PHARMACIST))
  public async dismissAlert(
    @Path() alertId: string,
    @Request() req: ExpressRequest
  ) {
    return ReorderAlertsService.dismissAlert(req, alertId);
  }
}
