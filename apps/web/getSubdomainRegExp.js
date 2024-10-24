exports.getSubdomainRegExp = (url) => {
  const baseDomain = new URL(url).hostname;
  const escapedBaseDomain = baseDomain.replace(/\./g, "\\.");
  const subdomainRegExp = `[^\\.]+`; // Padrão para o subdomínio, sem nomear o grupo
  return { subdomainRegExp, escapedBaseDomain };
};
