<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="text" />
  <xsl:template match="/data">
    <xsl:text><![CDATA[Your Contoso order ]]></xsl:text>
    <xsl:value-of select="contoso_order/contoso_ordernumber" />
    <xsl:text><![CDATA[ has shipped]]></xsl:text>
  </xsl:template>
</xsl:stylesheet>
