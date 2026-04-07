from enum import Enum


class AssetType(str, Enum):
    TRADITIONAL_401K = "traditional_401k"
    ROTH_401K = "roth_401k"
    TRADITIONAL_IRA = "traditional_ira"
    ROTH_IRA = "roth_ira"
    HSA = "hsa"
    TAXABLE_BROKERAGE = "taxable_brokerage"
    FIVE29 = "529"
    REAL_ESTATE = "real_estate"
    CRYPTO = "crypto"
    OTHER = "other"


class ScenarioType(str, Enum):
    BULL = "bull"
    BASE = "base"
    BEAR = "bear"
    CUSTOM = "custom"
