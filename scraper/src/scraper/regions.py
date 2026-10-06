"""Find the Italian region a funghiitaliani.it photo was taken in, from the caption
of its post: "<author>; Regione Lombardia, Brallo (PV); Ottobre 2010; Foto di ...".

The caption is read line by line. A province code in brackets gives its region
("Cles (TN)" is Trentino-Alto Adige) and wins over the region names on the same
line ("Parco Nazionale d'Abruzzo Lazio e Molise - Villetta Barrea (AQ)" is Abruzzo);
otherwise a region name counts when the line looks like a caption, i.e. it says
"Regione" or "Foto", or it is short, so the regions named in the descriptions are
skipped. Places abroad give no region.
"""

import re

# Region of every province code, e.g. "TN" -> "Trentino-Alto Adige".
PROVINCE_REGIONS: dict[str, str] = {
    **dict.fromkeys(["TO", "VC", "NO", "CN", "AT", "AL", "BI", "VB"], "Piemonte"),
    "AO": "Valle d'Aosta",
    **dict.fromkeys(
        ["VA", "CO", "SO", "MI", "BG", "BS", "PV", "CR", "MN", "LC", "LO", "MB"], "Lombardia"
    ),
    **dict.fromkeys(["BZ", "TN"], "Trentino-Alto Adige"),
    **dict.fromkeys(["VR", "VI", "BL", "TV", "VE", "PD", "RO"], "Veneto"),
    **dict.fromkeys(["UD", "GO", "TS", "PN"], "Friuli-Venezia Giulia"),
    **dict.fromkeys(["IM", "SV", "GE", "SP"], "Liguria"),
    **dict.fromkeys(["PC", "PR", "RE", "MO", "BO", "FE", "RA", "FC", "RN"], "Emilia-Romagna"),
    **dict.fromkeys(["MS", "LU", "PT", "FI", "LI", "PI", "AR", "SI", "GR", "PO"], "Toscana"),
    **dict.fromkeys(["PG", "TR"], "Umbria"),
    **dict.fromkeys(["PU", "AN", "MC", "AP", "FM"], "Marche"),
    **dict.fromkeys(["VT", "RI", "RM", "LT", "FR"], "Lazio"),
    **dict.fromkeys(["AQ", "TE", "PE", "CH"], "Abruzzo"),
    **dict.fromkeys(["CB", "IS"], "Molise"),
    **dict.fromkeys(["CE", "BN", "NA", "AV", "SA"], "Campania"),
    **dict.fromkeys(["FG", "BA", "TA", "BR", "LE", "BT"], "Puglia"),
    **dict.fromkeys(["PZ", "MT"], "Basilicata"),
    **dict.fromkeys(["CS", "CZ", "RC", "KR", "VV"], "Calabria"),
    **dict.fromkeys(["TP", "PA", "ME", "AG", "CL", "EN", "CT", "RG", "SR"], "Sicilia"),
    **dict.fromkeys(["SS", "NU", "CA", "OR", "SU"], "Sardegna"),
}

# Case sensitive regular expressions, matched as whole words: "Marche" is the
# region, "marche" (brands) is not.
REGION_ALIASES: dict[str, list[str]] = {
    "Piemonte": ["Piemonte"],
    "Valle d'Aosta": [r"Valle?\s+d['’]\s*Aosta"],
    "Lombardia": ["Lombardia"],
    "Trentino-Alto Adige": ["Trentino", r"Alto[- ]Adige", "Südtirol", "Sudtirolo"],
    "Veneto": ["Veneto"],
    "Friuli-Venezia Giulia": ["Friuli", r"Venezia[- ]Giulia"],
    "Liguria": ["Liguria"],
    "Emilia-Romagna": ["Emilia", "Romagna"],
    "Toscana": ["Toscana"],
    "Umbria": ["Umbria"],
    "Marche": ["Marche"],
    "Lazio": ["Lazio"],
    "Abruzzo": ["Abruzzo", "Abruzzi"],
    "Molise": ["Molise"],
    "Campania": ["Campania"],
    "Puglia": ["Puglia", "Puglie"],
    "Basilicata": ["Basilicata", "Lucania"],
    "Calabria": ["Calabria"],
    "Sicilia": ["Sicilia"],
    "Sardegna": ["Sardegna"],
}

# Lines up to this length are captions even without "Regione" or "Foto", e.g.
# "Campioni della Sardegna." or "Raduno AMINT in Sardegna 2007".
MAX_CAPTION_LENGTH = 100
CAPTION_WORDS = re.compile(r"\b(Regione|[Ff]oto)\b")
# A province code in brackets, e.g. "(TN)". The publisher cities of the
# bibliography ("Alassio (SV): Ed. Candusso.") are followed by a colon.
PROVINCE_CODE = re.compile(r"\(([A-Z]{2})\)(?!\s*:)")
_REGION_NAMES = list(REGION_ALIASES)
REGION_NAME = re.compile(
    "|".join(
        rf"(?P<r{i}>\b(?:{'|'.join(aliases)})\b)"
        for i, aliases in enumerate(REGION_ALIASES.values())
    )
)


def caption_region(lines: list[str]) -> str:
    """The first Italian region named in the caption lines of a post, or ''."""
    for line in lines:
        regions = line_regions(line)
        if regions:
            return regions[0]
    return ""


def line_regions(line: str) -> list[str]:
    """The regions named in a line, in order."""
    codes = [code for code in PROVINCE_CODE.findall(line) if code in PROVINCE_REGIONS]
    if codes:
        return [PROVINCE_REGIONS[code] for code in codes]
    if len(line) > MAX_CAPTION_LENGTH and not CAPTION_WORDS.search(line):
        return []
    return [_REGION_NAMES[int(m.lastgroup[1:])] for m in REGION_NAME.finditer(line)]
