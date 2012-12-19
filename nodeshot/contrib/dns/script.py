from re import sub

def domainize(name)
"""
Method who convert a string in a domain compatible name
"""
    domainized_name = name.lower()
    domainized_name = sub(r'[^a-z0-9]+', '_', dn).strip('_')

    return domainized_name


