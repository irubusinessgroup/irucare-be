import EventEmitter from "events";
import {
  CreateCompanyDto,
  CreateCompanyStaffUnionDto,
  TCompany,
  TUser,
} from "../utils/interfaces/common";

import { EventType } from "./types";
import { companyCreatedHandler, companyUpdateHandler } from "./company";
import {
  companyStaffCreatedHandler,
  companyStaffUpdateHandler,
} from "./company.staff";

export const Emitter = new EventEmitter();

Emitter.on(
  EventType.COMPANY_CREATED,
  (company: TCompany, data: CreateCompanyDto) => {
    companyCreatedHandler(company, data);
  },
);

Emitter.on(
  EventType.COMPANY_UPDATED,
  (company: TCompany, data: CreateCompanyDto, userId: string) => {
    companyUpdateHandler(company, data, userId);
  },
);

Emitter.on(
  EventType.COMPANY_STAFF_CREATED,
  (user: TUser, data: CreateCompanyStaffUnionDto, companyId: string) => {
    companyStaffCreatedHandler(user, data, companyId);
  },
);

Emitter.on(
  EventType.COMPANY_STAFF_UPDATED,
  (user: TUser, data: CreateCompanyStaffUnionDto, companyId: string) => {
    companyStaffUpdateHandler(user, data, companyId);
  },
);
