import { Body, Controller, Post, Route, Security, Tags } from "tsoa";
import {
  ClinicalDecisionSupportService,
  DrugInteractionCheck,
  AllergyCheck,
  DosageValidation,
} from "../services/ClinicalDecisionSupportService";

@Tags("Clinical Decision Support")
@Route("api/prescriptions")
@Security("jwt")
export class ClinicalDecisionSupportController extends Controller {
  @Post("/check-interactions")
  public checkInteractions(@Body() body: DrugInteractionCheck) {
    return ClinicalDecisionSupportService.checkInteractions(body);
  }

  @Post("/check-allergies")
  public checkAllergies(@Body() body: AllergyCheck) {
    return ClinicalDecisionSupportService.checkAllergies(body);
  }

  @Post("/validate-dosage")
  public validateDosage(@Body() body: DosageValidation) {
    return ClinicalDecisionSupportService.validateDosage(body);
  }
}
