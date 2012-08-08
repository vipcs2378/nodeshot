from re import sub

class DnsImport:

    def domainize(self, name, *args, **kwargs)
    """
    Method who convert a string in a domain compatible name, just containing a-z and _
    """
	dn = name.lower()
	dn = sub(r'[^a-z0-9]+', '_', dn).strip('_')

        return dn


