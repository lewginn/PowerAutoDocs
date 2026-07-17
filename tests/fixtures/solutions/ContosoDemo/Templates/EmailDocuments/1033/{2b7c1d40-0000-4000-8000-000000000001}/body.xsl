<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" />
  <xsl:template match="/data">
    <xsl:text><![CDATA[<p>Hello ]]></xsl:text>
    <xsl:value-of select="contact/firstname" />
    <xsl:text><![CDATA[,</p><p>Account: ]]></xsl:text>
    <xsl:value-of select="contact/parentcustomerid/@name" />
    <xsl:text><![CDATA[</p><ul><li>Tracking&nbsp;code:&nbsp;CON-4471</li></ul><p>Thanks,<br />The Contoso&amp;Co team</p>]]></xsl:text>
    <xsl:for-each select="/data/contoso_orderline">
      <xsl:value-of select="/data/contoso_order/contoso_total" />
    </xsl:for-each>
  </xsl:template>
</xsl:stylesheet>
