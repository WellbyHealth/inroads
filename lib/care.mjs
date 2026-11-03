// Post-acute care types Wellby serves (matches the marketing site's specialties, post-acute first).
// The app uses the same keys to pick how well each kind of referral source fits the agency.
export const CARE = {
  home_care: { label: 'Home care', org: 'home care agency', services: 'Non-medical in-home care: personal care, companionship, respite, overnight and 24-hour care, transitions home from hospital or rehab.' },
  home_health: { label: 'Home health', org: 'home health agency', services: 'Skilled care at home: nursing, physical, occupational and speech therapy, and medical social work after a hospital or rehab stay.' },
  hospice: { label: 'Hospice', org: 'hospice', services: 'Hospice and palliative care at home and in facilities: comfort-focused nursing, aides, social work, chaplaincy and family support.' },
  snf: { label: 'Skilled nursing', org: 'skilled nursing facility', services: 'Short-term rehab and skilled nursing after a hospital stay, plus long-term care.' },
  rehab: { label: 'Rehab', org: 'rehabilitation provider', services: 'Intensive inpatient or outpatient rehabilitation after stroke, injury, surgery or illness.' },
  assisted_living: { label: 'Assisted living', org: 'assisted living community', services: 'Assisted living and memory care with help for daily activities, meals and medication.' },
  home_infusion: { label: 'Home infusion', org: 'home infusion provider', services: 'Infusion therapy at home with pharmacy and nursing support.' },
  other: { label: 'Post-acute care', org: 'post-acute care provider', services: '' },
};
export const careOf = k => CARE[k] ? k : 'home_care';
